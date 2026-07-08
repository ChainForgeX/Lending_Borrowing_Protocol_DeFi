import {expect} from "chai";
import {network} from "hardhat";

let ethers : any;
let owner : any;
let user : any;

let loanToken : any;
let lendingProtocol : any;
let mockPriceOracle : any;

describe("LendingProtocol", function(){
    beforeEach(async function(){
        ({ethers} = await network.getOrCreate());
        [owner, user] = await ethers.getSigners();
        const LoanToken = await ethers.getContractFactory("LoanToken");
        loanToken = await LoanToken.deploy();
        await loanToken.waitForDeployment();

        const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
        mockPriceOracle = await MockPriceOracle.deploy(1700n * 10n ** 8n);
        await mockPriceOracle.waitForDeployment();

        const LendingProtocol = await ethers.getContractFactory("LendingProtocol");
        lendingProtocol = await LendingProtocol.deploy(await loanToken.getAddress(), await mockPriceOracle.getAddress());
        await lendingProtocol.waitForDeployment();
        await loanToken.transfer(await lendingProtocol.getAddress(), ethers.parseEther("500000"));
    });
    it("Should deploy LoanToken successfully", async function(){
        expect(await loanToken.name()).to.equal("Loan Token");
        expect(await loanToken.symbol()).to.equal("LT");
    });
    it("Should fund the Lending Protocol", async function(){
        const protocolBalance = await loanToken.balanceOf(await lendingProtocol.getAddress());
        expect(protocolBalance).to.equal(ethers.parseEther("500000"));
    });
    it("Should allow a user to deposit ETH", async function(){
        await lendingProtocol.connect(user).deposit({
            value : ethers.parseEther("10")
        });
        const userInfo = await lendingProtocol.users(await user.getAddress());
        expect(userInfo.collateral).to.equal(ethers.parseEther("10"));
        const reserve = await lendingProtocol.reserve();
        expect(reserve.totalDeposits).to.equal(ethers.parseEther("10"));
    });
    it("Should allow a user to borrow LoanTokens", async function(){
        await lendingProtocol.connect(user).deposit({
            value : ethers.parseEther("10")
        });
        await lendingProtocol.connect(user).borrow(ethers.parseEther("5"));
        const userInfo = await lendingProtocol.users(await user.getAddress());
        expect(userInfo.borrowed).to.equal(ethers.parseEther("5"));
        const reserve = await lendingProtocol.reserve();
        expect(reserve.totalBorrowed).to.equal(ethers.parseEther("5"));
        expect(await loanToken.balanceOf(await user.getAddress())).to.equal(ethers.parseEther("5"));
    });
    it("Should allow a user to repay LoanTokens", async function(){
        await lendingProtocol.connect(user).deposit({
            value : ethers.parseEther("10")
        });
        await lendingProtocol.connect(user).borrow(ethers.parseEther("5"));
        await loanToken.connect(user).approve(
            await lendingProtocol.getAddress(), ethers.parseEther("5")
        );
        await lendingProtocol.connect(user).repay(ethers.parseEther("5"));
        const userInfo = await lendingProtocol.users(await user.getAddress());
        expect(userInfo.borrowed).to.equal(0);
        const reserve = await lendingProtocol.reserve();
        expect(reserve.totalBorrowed).to.equal(0);
    });
    it("Should allow a user to withdraw LoanTokens", async function(){
        await lendingProtocol.connect(user).deposit({
            value : ethers.parseEther("10")
        });
        await lendingProtocol.connect(user).borrow(ethers.parseEther("5"));
        await loanToken.connect(user).approve(
            await lendingProtocol.getAddress(), ethers.parseEther("5")
        );
        await lendingProtocol.connect(user).repay(ethers.parseEther("5"));
        await lendingProtocol.connect(user).withdraw(ethers.parseEther("10"));
        const protocolBalance = await ethers.provider.getBalance(await lendingProtocol.getAddress());
        const userInfo = await lendingProtocol.users(await user.getAddress());
        expect(userInfo.collateral).to.equal(0);
        const reserve = await lendingProtocol.reserve();
        expect(reserve.totalDeposits).to.equal(0);
        expect(protocolBalance).to.equal(0);
    });
    it("Should liquidate an unhealthy position", async function (){
        await lendingProtocol.connect(user).deposit({
            value: ethers.parseEther("10"),
        });
        await lendingProtocol.connect(user).borrow(ethers.parseEther("5000"));
        // Crash ETH price
        await mockPriceOracle.setPrice(500n * 10n ** 8n);
        await loanToken.approve(await lendingProtocol.getAddress(), ethers.parseEther("2500"));
        await lendingProtocol.liquidate(await user.getAddress(), ethers.parseEther("2500"));

        const userInfo = await lendingProtocol.users(await user.getAddress());
        expect(userInfo.borrowed).to.equal(ethers.parseEther("2500"));
    });
});