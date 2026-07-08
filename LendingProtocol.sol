//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./PriceOracle.sol";
import "./InterestRateModel.sol";

contract LendingProtocol{
    IERC20 public loanToken;
    struct User{
        uint256 collateral;
        uint256 borrowed;
        uint256 lastBorrowTimestamp;
    }
    struct Reserve{
        uint256 totalDeposits;
        uint256 totalBorrowed;
    }
    Reserve public reserve;
    PriceOracle public priceOracle;
    InterestRateModel public interestRateModel;
    uint256 public constant LTV = 7500;
    uint256 public constant PRECISION = 10000;
    uint256 public constant CLOSE_FACTOR = 5000;
    uint256 public constant LIQUIDATION_BONUS = 500;

    mapping(address => User) public users;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Liquidated(address indexed borrower, address indexed liquidator, uint256 repayAmount, uint256 collateralSeized);

    error AmountMustBeGreaterThanZero();
    error InsufficientCollateral();
    error OutstandingLoan();
    error NoCollateral();
    error InsufficientLiquidity();
    error NoOutstandingDebt();
    error HealthFactorTooLow();
    error HealthFactorOk();

    constructor(address _loanToken, address _priceOracle, address _interestRateModel){
        loanToken = IERC20(_loanToken);
        priceOracle = PriceOracle(_priceOracle);
        interestRateModel = InterestRateModel(_interestRateModel);
    }

    function getAvailableLiquidity() public view returns(uint256){
        return loanToken.balanceOf(address(this));
    }

    function calculateHealthFactor(uint256 collateral, uint256 borrowed) internal view returns(uint256){
        if(borrowed == 0){
            return type(uint256).max;
        }
        uint256 ethPrice = priceOracle.getETHPrice();
        ethPrice = ethPrice * 1e10;
        uint256 collateralValue = (collateral * ethPrice) / 1e18;
        uint256 maxBorrow = (collateralValue * LTV) / PRECISION;
        return (maxBorrow * PRECISION) / borrowed;
    } 

    function calculateInterest(uint256 principal, uint256 borrowTimestamp) internal view returns(uint256){
        if(principal == 0){
            return 0;
        }
        uint256 rate = interestRateModel.getBorrowRate(reserve.totalBorrowed, reserve.totalDeposits);
        uint256 timeElapsed = block.timestamp - borrowTimestamp;

        uint256 interest = (principal * rate * timeElapsed) / (365 days * PRECISION);
        return interest;
    }

    function getHealthFactor(address userAddress) public view returns(uint256){
        User memory user = users[userAddress];

        return calculateHealthFactor(user.collateral, user.borrowed);
    }

    function deposit() external payable{
        if(msg.value == 0){
            revert AmountMustBeGreaterThanZero();
        }
        users[msg.sender].collateral += msg.value;
        reserve.totalDeposits += msg.value;
        
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external payable{
        if(amount == 0){
            revert AmountMustBeGreaterThanZero();
        }
        if(users[msg.sender].collateral < amount){
            revert InsufficientCollateral();
        }
        User storage user = users[msg.sender];
        uint256 healthFactor = calculateHealthFactor(user.collateral - amount, user.borrowed);
        if (healthFactor < PRECISION) {
            revert HealthFactorTooLow();
        }
        users[msg.sender].collateral -= amount;
        reserve.totalDeposits -= amount;

        payable(msg.sender).transfer(amount);

        emit Withdrawn(msg.sender, amount);
    }

    function borrow(uint256 amount) external{
        if(amount == 0){
            revert AmountMustBeGreaterThanZero();
        }
        User storage user = users[msg.sender];
        uint256 newBorrowed = user.borrowed + amount;
        if(user.collateral == 0){
            revert NoCollateral();
        }
        uint256 healthFactor = calculateHealthFactor(user.collateral, newBorrowed);
        if (healthFactor < PRECISION) {
            revert HealthFactorTooLow();
        }
        if(amount > getAvailableLiquidity()){
            revert InsufficientLiquidity();
        }
        user.borrowed += amount;
        user.lastBorrowTimestamp = block.timestamp;
        reserve.totalBorrowed += amount;

        bool success = loanToken.transfer(msg.sender, amount);
        require(success, "Transfer Failed");

        emit Borrowed(msg.sender, amount);
    }

    function repay(uint256 amount) external{
        if (amount == 0){
            revert AmountMustBeGreaterThanZero();
        }
        User storage user = users[msg.sender];

        uint256 interest = calculateInterest(user.borrowed, user.lastBorrowTimestamp);
        uint256 totalDebt = user.borrowed + interest;
        user.lastBorrowTimestamp = block.timestamp;
        
        if(user.borrowed == 0){
            revert NoOutstandingDebt();
        }
        if(amount > totalDebt){
            amount = totalDebt;
        }
        bool success = loanToken.transferFrom(msg.sender, address(this), amount);
        require(success, "Transfer Failed");

        if (amount >= interest){
            uint256 principalPaid = amount - interest;

            if (principalPaid > user.borrowed){
                principalPaid = user.borrowed;
            }
            user.borrowed -= principalPaid;
            reserve.totalBorrowed -= principalPaid;
        }else{
            // User only paid part of the interest
        }

        emit Repaid(msg.sender, amount);
    }
    function liquidate(address borrower, uint256 repayAmount) external {
        User storage user = users[borrower];
        uint256 healthFactor = getHealthFactor(borrower);
        if(healthFactor >= PRECISION){
            revert HealthFactorOk();
        }
        uint256 maxLiquidation = (user.borrowed * CLOSE_FACTOR) / PRECISION;
        if(repayAmount > maxLiquidation){
            repayAmount = maxLiquidation;
        }
        bool success = loanToken.transferFrom(msg.sender, address(this), repayAmount);
        require(success, "Transfer Failed");
        user.borrowed -= repayAmount;
        reserve.totalBorrowed -= repayAmount;
        uint256 ethPrice = priceOracle.getETHPrice();
        uint256 collateralToSeize = (repayAmount * 1e18) / ethPrice;
        collateralToSeize = (collateralToSeize * (PRECISION + LIQUIDATION_BONUS)) / PRECISION;
        if(collateralToSeize > user.collateral){
            collateralToSeize = user.collateral;
        }
        user.collateral -= collateralToSeize;
        reserve.totalDeposits -= collateralToSeize;

        (bool sent, ) = payable(msg.sender).call{value : collateralToSeize}("");
        require(sent, "ETH Transfer Failed");

        emit Liquidated(borrower, msg.sender, repayAmount, collateralToSeize);
    }
}