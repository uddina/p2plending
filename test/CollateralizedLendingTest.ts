import { ethers } from "hardhat";
import { Signer, BigNumberish } from "ethers";
import { expect } from "chai";

describe("CollateralizedLending", function () {
  let deployer: Signer;
  let lender: Signer;
  let borrower: Signer;
  let lendingContract: any;
  let stableTokenContract: any;
  let collateralTokenContract: any;
  const exchangeRate = 5000;

  enum AgreementStatus {
    None,
    Active,
    Filled,
  }

  before(async () => {
    // Get the deployer signer
    [deployer, lender, borrower] = await ethers.getSigners();

    const StableToken = await ethers.getContractFactory("StableToken");
    console.log("Deploying StableToken");
    stableTokenContract = await StableToken.connect(deployer).deploy();
    console.log("awaiting confirmation");
    await stableTokenContract.waitForDeployment();
    console.log("Deployed contract confirmation");
    const stableTokenAddress = await stableTokenContract.getAddress(); // Set the address of the stable token
    console.log("StableToken deployed to:", stableTokenAddress);

    const CollateralToken = await ethers.getContractFactory("CollateralToken");
    console.log("Deploying CollateralToken");
    collateralTokenContract = await CollateralToken.connect(deployer).deploy();
    console.log("awaiting confirmation");
    await collateralTokenContract.waitForDeployment();
    console.log("Deployed contract confirmation");
    const collateralTokenAddress = await collateralTokenContract.getAddress(); // Set the address of the stable token
    console.log("CollateralToken deployed to:", collateralTokenAddress);

    const CollateralizedLending = await ethers.getContractFactory(
      "CollateralizedLending"
    );
    console.log("Deploying CollateralizedLending");
    lendingContract = await CollateralizedLending.connect(deployer).deploy(
      stableTokenAddress,
      collateralTokenAddress,
      exchangeRate
    );
    console.log("awaiting confirmation");
    await lendingContract.waitForDeployment();
    console.log("Deployed contract confirmation");

    console.log(
      "CollateralizedLending deployed to:",
      await lendingContract.getAddress()
    );

    // Transfer 5000 stable tokens from deployer to lender
    const lenderAddress = await lender.getAddress();
    const stableTokenAmount = ethers.parseEther("5000");
    await stableTokenContract.transfer(lenderAddress, stableTokenAmount);

    // Transfer 1000 collateral tokens from deployer to borrower
    const borrowerAddress = await borrower.getAddress();
    const collateralTokenAmount = ethers.parseEther("25000");
    await collateralTokenContract.transfer(
      borrowerAddress,
      collateralTokenAmount
    );
    // Transfer 5000 stable tokens from deployer to borrower
    await stableTokenContract.transfer(borrowerAddress, stableTokenAmount);
  });

  it("should initialize token balances correctly", async () => {
    // Ensures that token balances are initialized correctly before any lending activities take place

    const deployerAddress = await deployer.getAddress();
    const lenderAddress = await lender.getAddress();
    const borrowerAddress = await borrower.getAddress();

    const stableTokenDeployerBalance: BigNumberish =
      await stableTokenContract.balanceOf(deployerAddress);
    expect(stableTokenDeployerBalance).to.equal(
      ethers.parseEther("99990000"),
      "Deployer should have 99,990,000 StableToken"
    );

    const collateralTokenDeployerBalance: BigNumberish =
      await collateralTokenContract.balanceOf(deployerAddress);
    expect(collateralTokenDeployerBalance).to.equal(
      ethers.parseEther("99975000"),
      "Deployer should have 99,975,000 CollateralToken"
    );

    const stableTokenLenderBalance: BigNumberish =
      await stableTokenContract.balanceOf(lenderAddress);
    expect(stableTokenLenderBalance).to.equal(
      ethers.parseEther("5000"),
      "Lender should have 5000 StableToken"
    );

    const collateralTokenLenderBalance: BigNumberish =
      await collateralTokenContract.balanceOf(lenderAddress);
    expect(collateralTokenLenderBalance).to.equal(
      ethers.parseEther("0"),
      "Lender should have 0 CollateralToken"
    );

    const stableTokenBorrowerBalance: BigNumberish =
      await stableTokenContract.balanceOf(borrowerAddress);
    expect(stableTokenBorrowerBalance).to.equal(
      ethers.parseEther("5000"),
      "Borrower should have 5000 StableToken"
    );

    const collateralTokenBorrowerBalance: BigNumberish =
      await collateralTokenContract.balanceOf(borrowerAddress);
    expect(collateralTokenBorrowerBalance).to.equal(
      ethers.parseEther("25000"),
      "Borrower should have 25000 CollateralToken"
    );
  });

  it("should update the exchange rate correctly", async () => {
    // Verifies that the exchange rate can be updated correctly in the lending contract

    const newExchangeRate = 6000; // New exchange rate to be set

    // Update the exchange rate
    await lendingContract.updateExchangeRate(newExchangeRate);

    // Get the updated exchange rate
    const updatedExchangeRate = await lendingContract.exchangeRate();

    // Assert the updated exchange rate
    expect(updatedExchangeRate).to.equal(
      newExchangeRate,
      "Exchange rate should be updated correctly"
    );
  });

  it("should allow lenders to offer lending and create the lending agreement", async () => {
    // Tests the functionality of lenders offering lending and creating lending agreements

    /**
     * Setup (Arrange)
     **/
    // Connect the lender signer to the lending contract
    const lenderContract = lendingContract.connect(lender);

    // Set the principal and lock period for the lending offer
    const principal = ethers.parseEther("20"); // Principal amount to be lent
    const lockPeriod = 6; // Lock period in months

    /**
     * Execution (Act)
     **/
    // Create a connected instance of stableTokenContract for the lender
    const lenderStableTokenContract = stableTokenContract.connect(lender);

    // Get the lender's stable token balance before offering lending
    const initialStableTokenBalance = await lenderStableTokenContract.balanceOf(
      await lender.getAddress()
    );

    // Update the exchange rate
    await lendingContract.updateExchangeRate(exchangeRate);

    // Approve the lendingContract to be able to transfer the stable token
    await lenderStableTokenContract.approve(
      lendingContract.getAddress(),
      principal
    );

    // Offer lending by calling the offerLending function
    await lenderContract.offerLending(principal, lockPeriod);

    // Get the lending agreement for the lender
    const lendingAgreement = await lendingContract.lendersAgreements(
      await lender.getAddress()
    );

    // Get the lender's stable token balance after offering lending
    const finalStableTokenBalance = await lenderStableTokenContract.balanceOf(
      await lender.getAddress()
    );

    /**
     * Assertion (Assert)
     **/
    // Assert that the lending agreement is created with the correct values
    expect(lendingAgreement.principal).to.equal(principal);
    expect(lendingAgreement.lockPeriod).to.equal(lockPeriod);
    expect(lendingAgreement.lenderAddress).to.equal(await lender.getAddress());
    expect(lendingAgreement.status).to.equal(AgreementStatus.Active);

    // Assert that the lender's stable token balance is reduced by the principal amount
    expect(finalStableTokenBalance).to.equal(
      initialStableTokenBalance - BigInt(principal),
      "Lender's stable token balance should be reduced by the principal amount"
    );
  });

  it("should prevent lenders from creating multiple loan agreements", async () => {
    // Verifies that lenders are prevented from creating multiple loan agreements

    /**
     * Setup (Arrange)
     **/
    // Connect the lender signer to the lending contract
    const lenderContract = lendingContract.connect(lender);

    // Set the principal and lock period for the lending offer
    const principal = ethers.parseEther("20"); // Principal amount to be lent
    const lockPeriod = 6; // Lock period in months

    /**
     * Execution (Act)
     **/
    // Create a connected instance of stableTokenContract for the lender
    const lenderStableTokenContract = stableTokenContract.connect(lender);

    // Approve the lendingContract to be able to transfer the stable token
    await lenderStableTokenContract.approve(
      lendingContract.getAddress(),
      principal
    );

    // Attempt to offer lending again and catch the error
    let errorCaught = false;
    try {
      await lenderContract.offerLending(principal, lockPeriod);
    } catch (error: any) {
      errorCaught = true;
      expect(error.message).to.contain(
        "Borrower has already borrowed",
        "Should catch the 'Borrower has already borrowed' error"
      );
    }

    /**
     * Assertion (Assert)
     **/
    expect(errorCaught).to.be.true;
  });

  it("should allow borrowers to borrow funds and fill the lending agreement", async () => {
    // Tests the borrowing process for borrowers and ensures that the lending agreement is correctly filled

    /**
     * Setup (Arrange)
     **/
    // Connect the borrower signer to the lending contract
    const borrowerLendingContract = lendingContract.connect(borrower);

    // Set the principal and lock period for the lending agreement
    const principal = ethers.parseEther("20"); // Principal amount to be borrowed
    const lockPeriod = 6; // Lock period in months

    // Get the borrower's address
    const borrowerAddress = await borrower.getAddress();

    // Create a connected instance of collateralTokenContract for the borrower
    const borrowerCollateralTokenContract =
      collateralTokenContract.connect(borrower);

    /**
     * Execution (Act)
     **/
    // Get the borrower's collateral token balance before borrowing
    const initialCollateralTokenBalance =
      await borrowerCollateralTokenContract.balanceOf(borrowerAddress);

    // Get the borrower's stable token balance before borrowing
    const initialStableTokenBalance = await stableTokenContract.balanceOf(
      borrowerAddress
    );

    // Calculate the collateral amount
    const collateralAmount =
      (principal * BigInt(2) * BigInt(exchangeRate)) / BigInt(1000);

    // Approve the lendingContract to be able to transfer the collateral token
    await borrowerCollateralTokenContract.approve(
      borrowerLendingContract.getAddress(),
      collateralAmount
    );

    // Borrow funds by calling the borrow function
    await borrowerLendingContract.borrow(await lender.getAddress());

    /**
     * Assertion (Assert)
     **/
    // Get the lending agreement for the borrower
    const lendingAgreement = await lendingContract.borrowersAgreements(
      borrowerAddress
    );

    // Get the borrower's collateral token balance after borrowing
    const finalCollateralTokenBalance =
      await borrowerCollateralTokenContract.balanceOf(borrowerAddress);

    // Get the borrower's stable token balance after borrowing
    const finalStableTokenBalance = await stableTokenContract.balanceOf(
      borrowerAddress
    );

    // Assert that the lending agreement is filled with the correct values
    expect(lendingAgreement.principal).to.equal(principal);
    expect(lendingAgreement.lockPeriod).to.equal(lockPeriod);
    expect(lendingAgreement.lenderAddress).to.equal(await lender.getAddress());
    expect(lendingAgreement.status).to.equal(AgreementStatus.Filled);

    // Assert that the borrower's collateral token balance is reduced by the collateral amount
    expect(finalCollateralTokenBalance).to.equal(
      initialCollateralTokenBalance - BigInt(collateralAmount),
      "Borrower's collateral token balance should be reduced by the collateral amount"
    );

    // Assert that the borrower's stable token balance remains unchanged
    expect(finalStableTokenBalance).to.equal(
      initialStableTokenBalance + BigInt(principal),
      "Borrower's stable token balance should remain unchanged"
    );
  });

  it("should prevent borrowers from borrowing funds multiple times", async () => {
    // Verifies that borrowers cannot borrow funds multiple times

    /**
     * Setup (Arrange)
     **/
    // Connect the borrower signer to the lending contract
    const borrowerLendingContract = lendingContract.connect(borrower);

    // Set the principal and lock period for the lending agreement
    const principal = ethers.parseEther("20"); // Principal amount to be borrowed
    const lockPeriod = 6; // Lock period in months

    // Get the borrower's address
    const borrowerAddress = await borrower.getAddress();

    // Create a connected instance of collateralTokenContract for the borrower
    const borrowerCollateralTokenContract =
      collateralTokenContract.connect(borrower);

    /**
     * Execution (Act)
     **/
    // Get the borrower's collateral token balance before borrowing
    const initialCollateralTokenBalance =
      await borrowerCollateralTokenContract.balanceOf(borrowerAddress);

    // Get the borrower's stable token balance before borrowing
    const initialStableTokenBalance = await stableTokenContract.balanceOf(
      borrowerAddress
    );

    // Calculate the collateral amount
    const collateralAmount =
      (principal * BigInt(2) * BigInt(exchangeRate)) / BigInt(1000);

    // Approve the lendingContract to be able to transfer the collateral token
    await borrowerCollateralTokenContract.approve(
      borrowerLendingContract.getAddress(),
      collateralAmount
    );

    // Borrow funds by calling the borrow function
    let errorCaught = false;
    try {
      await borrowerLendingContract.borrow(await lender.getAddress());
    } catch (error: any) {
      errorCaught = true;
      expect(error.message).to.contain(
        "Borrower has already borrowed",
        "Should catch the 'Borrower has already borrowed' error"
      );
    }

    /**
     * Assertion (Assert)
     **/
    expect(errorCaught).to.be.true;
  });

  it("should allow borrowers to repay their loans and calculate the repayment amount correctly", async () => {
    // Tests the repayment process for borrowers and ensures that the repayment amount is calculated correctly

    /**
     * Setup (Arrange)
     **/
    // Connect the borrower signer to the lending contract
    const borrowerLendingContract = lendingContract.connect(borrower);
    const borrowerstableTokenContract = stableTokenContract.connect(borrower);

    // Set the repayment amount
    // (20 * 5%) * 6 months = 6
    const repaymentAmount = ethers.parseEther("26"); // Repayment amount to be made
    // Get the borrower's stable token balance before repayment
    const initialStableTokenBalance = await stableTokenContract.balanceOf(
      await borrower.getAddress()
    );
    // Get the borrower's Collateral token balance before repayment
    const initialCollateralTokenBalance =
      await collateralTokenContract.balanceOf(await borrower.getAddress());
    // Get the lending agreement for the borrower
    const lendingAgreement = await lendingContract.borrowersAgreements(
      await borrower.getAddress()
    );

    // Connect the deployer signer to the lending contract
    const deployerLendingContract = lendingContract.connect(deployer);

    /**
     * Execution (Act)
     **/

    // Attemtpt to pay and collect the collateral by the a random person
    let errorCaught = false;
    try {
      await deployerLendingContract.repay();
    } catch (error: any) {
      errorCaught = true;
      expect(error.message).to.contain(
        "No agreement found for this borrower",
        "Should catch the 'Only the lender can claim collateral' error"
      );
    }

    // Approve the lendingContract to be able to transfer the stable token
    await borrowerstableTokenContract.approve(
      lendingContract.getAddress(),
      repaymentAmount
    );

    // Repay the loan by calling the repay function
    await borrowerLendingContract.repay();

    /**
     * Assertion (Assert)
     **/
    // Get the borrower's stable token balance after repayment
    const finalStableTokenBalance = await stableTokenContract.balanceOf(
      await borrower.getAddress()
    );
    // Get the borrower's Collateral token balance after repayment
    const finalCollateralTokenBalance = await collateralTokenContract.balanceOf(
      await borrower.getAddress()
    );

    // Assert that the borrower's stable token balance is reduced by the repayment amount
    expect(finalStableTokenBalance).to.equal(
      initialStableTokenBalance - repaymentAmount,
      "Borrower's stable token balance should be reduced by the repayment amount"
    );
    // Assert that the borrower's Collateral token balance has increased
    expect(finalCollateralTokenBalance).to.equal(
      initialCollateralTokenBalance + lendingAgreement.collateral,
      "Borrower's stable token balance should be reduced by the repayment amount"
    );
  });

  it("should allow lenders to claim collateral after the lock period has expired", async () => {
    // Verifies that lenders can claim collateral after the lock period has expired

    /**
     * Setup (Arrange)
     **/
    // Connect the lender and borrower signers to the lending contract
    const lenderLendingContract = lendingContract.connect(lender);
    const borrowerLendingContract = lendingContract.connect(borrower);
    const lenderCollateralTokenContract =
      collateralTokenContract.connect(lender);
    const borrowerCollateralTokenContract =
      collateralTokenContract.connect(borrower);
    const borrowerStableTokenContract = stableTokenContract.connect(borrower);
    const lenderStableTokenContract = stableTokenContract.connect(lender);

    // Set the lending parameters
    const principal = ethers.parseEther("20"); // Principal amount to be lent
    const lockPeriod = 1; // Lock period in months
    const exchangeRate = 5000; // 4 decimal places

    // Get the lender and borrower addresses
    const lenderAddress = await lender.getAddress();
    const borrowerAddress = await borrower.getAddress();
    const lendingContractAddress = await lendingContract.getAddress();
    // Approve the lendingContract to be able to transfer the stable token from the borrower
    await lenderStableTokenContract.approve(lendingContractAddress, principal);

    // Offer lending by the lender
    await lenderLendingContract.offerLending(principal, lockPeriod);

    const collateralAmount =
      (principal * BigInt(2) * BigInt(exchangeRate)) / BigInt(1000);
    // Approve the lendingContract to be able to transfer the stable token from the borrower
    await borrowerCollateralTokenContract.approve(
      lendingContractAddress,
      collateralAmount
    );

    // Borrow funds by the borrower
    await borrowerLendingContract.borrow(lenderAddress);

    // Calculate the expected lock period expiration timestamp
    const lendingAgreement = await lendingContract.borrowersAgreements(
      borrowerAddress
    );
    const lockPeriodExpirationTimestamp =
      lendingAgreement.borrowingTimestamp +
      BigInt(lockPeriod) * BigInt(30 * 24 * 60 * 60); // Adjusted lock period in seconds

    // Advance the block timestamp to simulate the lock period expiration
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(lockPeriodExpirationTimestamp) + 1,
    ]);
    await ethers.provider.send("evm_mine");

    // Get the lender's collateral token balance before claiming collateral
    const initialLenderCollateralTokenBalance =
      await lenderCollateralTokenContract.balanceOf(lenderAddress);

    // Get the borrower's collateral token balance before claiming collateral
    const initialBorrowerCollateralTokenBalance =
      await borrowerCollateralTokenContract.balanceOf(borrowerAddress);

    // Connect the deployer signer to the lending contract
    const deployerLendingContract = lendingContract.connect(deployer);

    /**
     * Execution (Act)
     **/
    // Attemtpt to claim collateral by the a random person
    let errorCaught = false;
    try {
      await deployerLendingContract.claimcollateral();
    } catch (error: any) {
      errorCaught = true;
      expect(error.message).to.contain(
        "No agreement found for this borrower",
        "Should catch the 'Only the lender can claim collateral' error"
      );
    }

    /**
     * Assertion (Assert)
     **/
    expect(errorCaught).to.be.true;
    // Claim collateral by the lender
    await lenderLendingContract.claimcollateral();

    /**
     * Assertion (Assert)
     **/
    // Get the lender's collateral token balance after claiming collateral
    const finalLenderCollateralTokenBalance =
      await lenderCollateralTokenContract.balanceOf(lenderAddress);

    // Get the borrower's collateral token balance after claiming collateral
    const finalBorrowerCollateralTokenBalance =
      await borrowerCollateralTokenContract.balanceOf(borrowerAddress);

    // Assert that the lender's collateral token balance has increased by the collateral amount
    expect(finalLenderCollateralTokenBalance).to.equal(
      initialLenderCollateralTokenBalance + lendingAgreement.collateral,
      "Lender's collateral token balance should be increased by the collateral amount"
    );
  });
});
