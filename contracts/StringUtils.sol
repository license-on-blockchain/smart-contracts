pragma solidity ^0.4.18;

library StringUtils {
    function concat(string _s1, string _s2, string _s3, string _s4, string _s5) internal pure returns (string){
        bytes memory _b1 = bytes(_s1);
        bytes memory _b2 = bytes(_s2);
        bytes memory _b3 = bytes(_s3);
        bytes memory _b4 = bytes(_s4);
        bytes memory _b5 = bytes(_s5);
        string memory concatString = new string(_b1.length + _b2.length + _b3.length + _b4.length + _b5.length);
        bytes memory concatBytes = bytes(concatString);
        uint k = 0;
        uint i;
        for (i = 0; i < _b1.length; i++) concatBytes[k++] = _b1[i];
        for (i = 0; i < _b2.length; i++) concatBytes[k++] = _b2[i];
        for (i = 0; i < _b3.length; i++) concatBytes[k++] = _b3[i];
        for (i = 0; i < _b4.length; i++) concatBytes[k++] = _b4[i];
        for (i = 0; i < _b5.length; i++) concatBytes[k++] = _b5[i];
        return string(concatBytes);
    }

    function concat(string _s1, string _s2, string _s3, string _s4) internal pure returns (string){
        return concat(_s1, _s2, _s3, _s4, "");
    }

    function concat(string _s1, string _s2, string _s3) internal pure returns (string){
        return concat(_s1, _s2, _s3, "", "");
    }

    function concat(string _s1, string _s2) internal pure returns (string){
        return concat(_s1, _s2, "", "", "");
    }

    function addressToString(address x) internal pure returns (string) {
        bytes memory s = new bytes(40);
        for (uint i = 0; i < 20; i++) {
            byte b = byte(uint8(uint(x) / (2**(8*(19 - i)))));
            byte hi = byte(uint8(b) / 16);
            byte lo = byte(uint8(b) - 16 * uint8(hi));
            s[2*i] = char(hi);
            s[2*i+1] = char(lo);            
        }
        return string(s);
    }

    function char(byte b) private pure returns (byte c) {
        if (b < 10) return byte(uint8(b) + 0x30);
        else return byte(uint8(b) + 0x57);
    }

    function uintToString(uint v) internal pure returns (string) {
        uint maxlength = 78;
        bytes memory reversed = new bytes(maxlength);
        uint i = 0;
        while (v != 0) {
            uint remainder = v % 10;
            v = v / 10;
            reversed[i++] = byte(48 + remainder);
        }
        bytes memory s = new bytes(i);
        for (uint j = 0; j < i; j++) {
            s[j] = reversed[i - j - 1];
        }
        return string(s);
    }
}