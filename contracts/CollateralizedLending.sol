// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./StableToken.sol";
import "./CollateralToken.sol";

/**
 *
 * @title Simplified Collateralized Lending contract
 * @author Azad Uddin
 * @notice This contract facilitates peer-to-peer collateralized lending with fixed interest rates and lock periods.
 *
 *
 * Assumptions made for this assignment:
 *
 * Fixed monthly interest rate of 5%
 * Interest is not compounded and is due at the end of the term
 * If borrower wants to pay early, they still need to pay the interest for the full term
 * All months have the same duration of 30 days
 * Exchage rate is in stable token equals to 5 collateral token
 *
 * For simplicity, currently designed such that lender can only have one lending, and borrower can have only one borrowing.
 * Need to refactor to allow for multi-lending and multi-borrowing
 */
contract CollateralizedLending is Ownable {
    using SafeERC20 for IERC20;

    struct LendingAgreement {
        uint256 principal; // in stable token
        uint256 collateral; // in non-stable token
        uint32 interestRate; // Represented as an integer with 4 decimal places (e.g., 5% -> 5000)
        uint8 lockPeriod; // Represented in months
        address lenderAddress;
        address borrowerAddress;
        uint256 borrowingTimestamp;
        AgreementStatus status;
    }

    enum AgreementStatus {
        None,
        Active,
        Filled
    }

    mapping(address => LendingAgreement) public borrowersAgreements;
    mapping(address => LendingAgreement) public lendersAgreements;
    uint32 public defaultInterestRate = 5000; // Represented as an integer with 4 decimal places (e.g., 5% -> 5000)
    uint32 public exchangeRate; // Using 3 decimal places
    address public stableToken;
    address public collateralToken;

    event LendingOffer(
        address indexed lender,
        uint256 principal,
        uint32 interestRate,
        uint8 lockPeriod
    );
    event Borrow(
        address indexed borrower,
        address indexed lender,
        uint256 principal,
        uint32 interestRate,
        uint8 lockPeriod
    );
    event LoanFilled(
        address indexed borrower,
        address indexed lender,
        uint256 principal,
        uint256 interest
    );
    event CollateralClaimed(
        address indexed lender,
        address indexed borrower,
        uint256 collateral
    );
    event LogBalance(address wall, uint256 balance);

    constructor(
        address _stableTokenAddress,
        address _collateralTokenAddress,
        uint32 _exchangeRate
    ) {
        stableToken = _stableTokenAddress;
        collateralToken = _collateralTokenAddress;
        exchangeRate = _exchangeRate;
    }

    /**
     * @dev Updates the exchange rate of the stable token.
     * @param newRate The new exchange rate.
     */
    function updateExchangeRate(uint32 newRate) external onlyOwner {
        exchangeRate = newRate;
    }

    /**
     * @dev Allows a lender to offer lending by depositing collateral.
     * @param principal The principal amount to be lent.
     * @param lockPeriod The lock period of the loan in months.
     */
    function offerLending(uint256 principal, uint8 lockPeriod) public {
        require(principal > 0, "Invalid principal amount");
        require(lockPeriod > 0, "Invalid lock period");
        require(
            lendersAgreements[msg.sender].lenderAddress == address(0),
            "Borrower has already borrowed, only one loan at a time"
        );

        uint256 lenderBalance = IERC20(stableToken).balanceOf(msg.sender);
        emit LogBalance(msg.sender, lenderBalance);

        require(
            lenderBalance >= principal,
            "principle amount is larger than lenders balance"
        );

        // Transfer stable tokens from lender to contract
        IERC20(stableToken).safeTransferFrom(
            msg.sender,
            address(this),
            principal
        );

        // Add lending agreement to lender's lendersAgreements mapping
        lendersAgreements[msg.sender] = LendingAgreement(
            principal,
            0,
            defaultInterestRate,
            lockPeriod,
            msg.sender,
            address(0),
            0,
            AgreementStatus.Active
        );

        emit LendingOffer(
            msg.sender,
            principal,
            defaultInterestRate,
            lockPeriod
        );
    }

    function borrow(address lender) external {
        require(msg.sender != address(0), "Invalid borrower address");

        require(
            borrowersAgreements[msg.sender].borrowerAddress == address(0),
            "Borrower has already borrowed, only one loan at a time"
        );

        LendingAgreement storage agreement = lendersAgreements[lender];

        require(
            agreement.lenderAddress != address(0),
            "No agreement found for this lender"
        );

        require(
            agreement.status == AgreementStatus.Active,
            "The agreement is not active"
        );

        uint256 principal = agreement.principal;
        uint256 expectedCollateralValue = principal * 2;

        // Convert stable tokens to collateral tokens using the exchange rate
        uint256 collateralAmount = (expectedCollateralValue * exchangeRate) /
            1000; // Multiply by exchangeRate and divide by 1,000 in 3 decimal places

        // Check contract's balance of collateral tokens
        uint256 remainingBalance = IERC20(collateralToken).balanceOf(
            address(msg.sender)
        );
        require(
            remainingBalance >= collateralAmount,
            "Insufficient contract balance"
        );

        // get the collateral token first, before sending the stable tokens
        IERC20(collateralToken).safeTransferFrom(
            msg.sender,
            address(this),
            collateralAmount
        );

        //update the LendingAgreement and add to borrowers mapping
        agreement.collateral = collateralAmount;
        agreement.borrowerAddress = msg.sender;
        agreement.borrowingTimestamp = block.timestamp;
        agreement.status = AgreementStatus.Filled;
        borrowersAgreements[msg.sender] = agreement;

        // Transfer the lenders principal amount (currently held by the contract) to the borrower
        IERC20(stableToken).transfer(msg.sender, principal);

        emit Borrow(
            msg.sender,
            lender,
            principal,
            agreement.interestRate,
            agreement.lockPeriod
        );
    }

    /**
     * @dev Allows a borrower to repay a loan to a specific lender.
     */
    function repay() external {
        LendingAgreement storage agreement = borrowersAgreements[msg.sender];

        require(
            agreement.lenderAddress != address(0),
            "No agreement found for this borrower"
        );

        require(
            msg.sender == agreement.borrowerAddress,
            "Only the borrower can initiate the repayment"
        );

        require(
            agreement.status == AgreementStatus.Filled,
            "The agreement is in an invalid state"
        );

        address lender = agreement.lenderAddress;
        uint256 repayInterestAmount = calculateInterest(agreement);

        uint256 repayStableAmount = agreement.principal + repayInterestAmount;

        require(repayStableAmount > 0, "Repayment amount cannot be zero");
        require(
            IERC20(stableToken).balanceOf(msg.sender) >= repayStableAmount,
            "Insufficient stable token balance for repayment"
        );

        IERC20(stableToken).safeTransferFrom(
            msg.sender,
            lender,
            repayStableAmount
        );
        IERC20(collateralToken).safeTransfer(msg.sender, agreement.collateral);

        //remove the LendingAgreement from both the lenders and borrowers mapping
        delete lendersAgreements[lender];
        delete borrowersAgreements[msg.sender];
        emit LoanFilled(
            msg.sender,
            lender,
            agreement.principal,
            repayInterestAmount
        );
    }

    /**
     * @dev Allows a borrower to repay a loan to a specific lender.
     */
    function claimcollateral() external {
        LendingAgreement storage agreement = lendersAgreements[msg.sender];

        require(
            agreement.lenderAddress != address(0),
            "No agreement found for this borrower"
        );

        require(
            agreement.status == AgreementStatus.Filled,
            "The agreement is in an invalid state"
        );

        require(
            hasLockPeriodExpired(agreement),
            "Lending agreement has not yet expired"
        );

        require(agreement.collateral > 0, "No collateral available to claim");

        require(
            msg.sender == agreement.lenderAddress,
            "Only the lender can claim collateral"
        );

        address lender = agreement.lenderAddress;
        address borrower = agreement.borrowerAddress;

        IERC20(collateralToken).safeTransfer(msg.sender, agreement.collateral);

        //remove the LendingAgreement from both the lenders and borrowers mapping
        delete lendersAgreements[lender];
        delete borrowersAgreements[msg.sender];
        emit CollateralClaimed(msg.sender, borrower, agreement.collateral);
    }

    /**
     * @dev Calculates the interest for a given lending agreement.
     * @param agreement The lending agreement for which to calculate the interest.
     * @return The calculated interest.
     */
    function calculateInterest(
        LendingAgreement storage agreement
    ) internal view returns (uint256) {
        uint256 interest = (((agreement.principal * agreement.interestRate) /
            100000) * agreement.lockPeriod);
        return interest;
    }

    function hasLockPeriodExpired(
        LendingAgreement storage agreement
    ) internal view returns (bool) {
        uint256 secondsElapsed = block.timestamp - agreement.borrowingTimestamp;
        uint256 monthsElapsed = secondsElapsed / (60 * 60 * 24 * 30);

        return monthsElapsed >= agreement.lockPeriod;
    }
}
