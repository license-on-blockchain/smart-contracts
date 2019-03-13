pragma solidity ^0.5.0;

contract EtherPriceOracleStub {
    uint public fee = 5000;

    function eurToEth(uint euro) public payable returns (uint) {
        require(msg.value >= fee);
        // Assume 1000 Wei = 1 Cent for test purposes
        return euro * 1000;
    }
}
