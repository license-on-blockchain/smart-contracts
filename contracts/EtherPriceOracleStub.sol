pragma solidity ^0.5.0;

contract EtherPriceOracleStub {
    // Assume 1000 Wei = 1 Cent for test purposes
    uint private exchangeRate = 1000;

    function eurToEth(uint euro) public view returns (uint) {
        return euro * exchangeRate;
    }
}
