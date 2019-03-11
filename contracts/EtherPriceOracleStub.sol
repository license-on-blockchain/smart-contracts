pragma solidity ^0.5.0;

contract EtherPriceOracleStub {
    function eurToEth(uint euro) public pure returns (uint) {
        // Assume 1000 Wei = 1 Cent for test purposes
        return euro * 1000;
    }
}
