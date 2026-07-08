//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockPriceOracle{
    uint256 public price;
    constructor(uint256 _price){
        price = _price;
    }

    function setPrice(uint256 _price) external{
        price = _price;
    }
    function getETHPrice() external view returns(uint256){
        return price;
    }
}