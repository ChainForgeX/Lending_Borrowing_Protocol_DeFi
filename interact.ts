import { network } from "hardhat";

async function main() {
    const { ethers } = await network.connect();

    const [signer] = await ethers.getSigners();

    const loanToken = await ethers.getContractAt(
        "LoanToken",
        "0xE03f8f9c81Db5c4Bc451433824bDf01ea1e8F85f"
    );

    const priceOracle = await ethers.getContractAt(
        "PriceOracle",
        "0x9EffeBB9265b03ee4eaf6fE3ad89353e1B758e6D"
    );

    const lendingProtocol = await ethers.getContractAt(
        "LendingProtocol",
        "0x8722EF1283E3666bf59c394d4f39C44657a456F4"
    );

    const fundTx = await loanToken.transfer(
        await lendingProtocol.getAddress(),
        ethers.parseEther("500000")
    );

    await fundTx.wait();

    console.log("✅ Protocol Funded");

    // ---------------- PRICE ----------------

    const price = await priceOracle.getETHPrice();

    console.log(
        "ETH Price : $",
        Number(price) / 1e8
    );

    // ---------------- DEPOSIT ----------------

    const depositTx = await lendingProtocol.deposit({
        value: ethers.parseEther("0.01"),
    });

    await depositTx.wait();

    console.log("✅ Deposit Successful");

    // ---------------- USER INFO ----------------

    let user = await lendingProtocol.users(
        await signer.getAddress()
    );

    console.log(
        "Collateral:",
        ethers.formatEther(user.collateral),
        "ETH"
    );

    console.log(
        "Borrowed:",
        ethers.formatEther(user.borrowed),
        "LT"
    );

    // ---------------- HEALTH FACTOR ----------------

    const healthFactor =
        await lendingProtocol.getHealthFactor(
            await signer.getAddress()
        );

    console.log(
        "Health Factor:",
        Number(healthFactor) / 10000
    );

    // ---------------- BORROW ----------------

    const borrowTx = await lendingProtocol.borrow(
        ethers.parseEther("5")
    );

    await borrowTx.wait();

    console.log("✅ Borrow Successful");

    const balance = await loanToken.balanceOf(
        await signer.getAddress()
    );

    const liquidity = await lendingProtocol.getAvailableLiquidity();

    console.log(
        "Protocol Liquidity:",
        ethers.formatEther(liquidity),
        "LT"
    );

    console.log(
        "LoanToken Balance:",
        ethers.formatEther(balance),
        "LT"
    );

    // ---------------- REPAY ----------------

    const approveTx = await loanToken.approve(await lendingProtocol.getAddress(), ethers.parseEther("5"));
    await approveTx.wait();

    console.log("✅ Approval Successful");

    const allowance = await loanToken.allowance(await signer.getAddress(), await lendingProtocol.getAddress());

    console.log(
        "Allowance:",
        ethers.formatEther(allowance),
        "LT"
    );

    const repayTx = await lendingProtocol.repay(ethers.parseEther("5"));
    await repayTx.wait();

    console.log("✅ Repay Successful");

    // ---------------- FINAL USER INFO ----------------

    user = await lendingProtocol.users(
        await signer.getAddress()
    );

    console.log("\n===== FINAL STATE =====");

    console.log(
        "Collateral:",
        ethers.formatEther(user.collateral),
        "ETH"
    );

    console.log(
        "Borrowed:",
        ethers.formatEther(user.borrowed),
        "LT"
    );

    const finalHealth =
        await lendingProtocol.getHealthFactor(
            await signer.getAddress()
        );

    console.log(
        "Health Factor:",
        Number(finalHealth) / 10000
    );
}

main().catch(console.error);