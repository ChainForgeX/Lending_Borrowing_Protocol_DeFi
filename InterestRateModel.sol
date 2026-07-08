// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract InterestRateModel {

    uint256 public constant BASE_RATE = 500;     
    uint256 public constant SLOPE = 1000;         
    uint256 public constant PRECISION = 10000;

    function getBorrowRate(uint256 totalBorrowed, uint256 totalDeposits) external pure returns (uint256){
        if (totalDeposits == 0) {
            return BASE_RATE;
        }
        uint256 utilization =(totalBorrowed * PRECISION) / totalDeposits;
        return BASE_RATE + (utilization * SLOPE) / PRECISION;
    }
}