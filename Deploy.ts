import {buildModule} from "@nomicfoundation/hardhat-ignition/modules";
export default buildModule ("LoanToken", (m)=>{
    const loanToken = m.contract("LoanToken");
    const priceOracle = m.contract("PriceOracle", ["0x694AA1769357215DE4FAC081bf1f309aDC325306"]);
    const interestRateModel = m.contract("InterestRateModel");
    const lendingProtocol = m.contract("LendingProtocol", [loanToken, priceOracle, interestRateModel]);

    return {loanToken, priceOracle, lendingProtocol};
});