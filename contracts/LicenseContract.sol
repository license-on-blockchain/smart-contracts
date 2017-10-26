pragma solidity ^0.4.15;

contract LicenseContract {

    modifier onlyIssuer() {
        require(msg.sender == issuer);
        _;
    }

    modifier onlyLOBRoot() {
        require(msg.sender == lobRoot);
        _;
    }

    modifier notRevoked(uint256 issuanceID) {
        require(!issuances[issuanceID].revoked);
        _;
    }

    struct Issuance {
        string description;
        string id;
        
        uint64 originalSupply;
        string auditRemark;
        string liability;


        bool revoked;

        mapping (address => mapping(address => uint64)) balance;
        mapping (address => uint64) reclaimableBalanceCache;
    }

    string public issuerName;

    /// Issuer's SSL certificate
    bytes public issuerCertificate;

    uint64 public fee;

    address public lobRoot;

    address public issuer;

    Issuance[] issuances;

    bool public disabled;

    bytes public signature;


    // Events

    event Issuing(uint256 issuanceID);
    event Transfer(uint256 issuanceID, address from, address to, uint64 amount, bool reclaimable);
    event Reclaim(uint256 issuanceID, address from, address to, uint64 amount);
    event Revoke(uint256 issuanceID);


    // Constructor

    function LicenseContract(
        address _issuer, 
        string _issuerName, 
        bytes _issuerCertificate, 
        uint64 _fee
    ) {
        issuer = _issuer;
        issuerName = _issuerName;
        issuerCertificate = _issuerCertificate;
        fee = _fee;
        lobRoot = msg.sender;
    }

    // Contract creation
    function sign(bytes _signature) onlyIssuer {
        // TODO: Test this
        // Don't allow resigning of the contract
        // TODO: Would it be desirable to allow resigning?
        require(signature.length == 0);
        signature = _signature;
    }

    function certificateText(
        string licenseDescription, 
        string licenseId, 
        uint64 numLicenses, 
        string auditRemark,
        string liability
    ) 
        public
        constant
        returns (string)
    {
        numLicenses = numLicenses;
        licenseDescription = licenseDescription;
        licenseId = licenseId;
        auditRemark = auditRemark;
        liability = liability;
        return licenseDescription;
    }

    function issueLicense(
        string description,
        string id,
        uint64 numLicenses,
        string auditRemark,
        string liability,
        address initialOwner
    )
        external
        onlyIssuer
        payable
        returns (uint256)
    {
        require(!disabled);
        // The license contract hasn't be initialised completely if it has not 
        // been signed. Thus disallow issuing licenses.
        require(signature.length != 0);
        require(msg.value >= fee);
        var issuance = Issuance(description, id, numLicenses, auditRemark, liability, /*revoked*/false);
        return issueLicenseImpl(issuance, initialOwner);
    }

    function issueLicenseImpl(Issuance issuance, address initialOwner) private returns (uint256) {
        var issuanceID = issuances.push(issuance) - 1;
        issuances[issuanceID].balance[initialOwner][initialOwner] = issuance.originalSupply;
        Issuing(issuanceID);
        Transfer(issuanceID, 0x0, initialOwner, issuance.originalSupply, false);
        return issuanceID;
    }



    // Contract transfer

    function balance(uint256 issuanceID, address owner) external constant returns (uint64) {
        var issuance = issuances[issuanceID];
        return issuance.balance[owner][owner] + issuance.reclaimableBalanceCache[owner];
    }

    function transfer(uint256 issuanceID, address to, uint64 amount) public notRevoked(issuanceID) {
        var issuance = issuances[issuanceID];
        require(issuance.balance[msg.sender][msg.sender] >= amount);

        issuance.balance[msg.sender][msg.sender] -= amount;
        issuance.balance[to][to] += amount;

        Transfer(issuanceID, /*from*/msg.sender, to, amount, /*reclaimable*/false);
    }

    function transferAndAllowReclaim(uint256 issuanceID, address to, uint64 amount) external notRevoked(issuanceID) {
        var issuance = issuances[issuanceID];
        require(issuance.balance[msg.sender][msg.sender] >= amount);

        issuance.balance[msg.sender][msg.sender] -= amount;
        issuance.balance[to][msg.sender] += amount;
        issuance.reclaimableBalanceCache[to] += amount;

        Transfer(issuanceID, /*from*/msg.sender, to, amount, /*reclaimable*/true);
    }

    function reclaim(uint256 issuanceID, address from, uint64 amount) external notRevoked(issuanceID) {
        var issuance = issuances[issuanceID];
        require(issuance.balance[from][msg.sender] >= amount);
        
        issuance.balance[from][msg.sender] -= amount;
        issuance.balance[msg.sender][msg.sender] += amount;
        issuance.reclaimableBalanceCache[from] -= amount;

        Reclaim(issuanceID, from, /*to*/msg.sender, amount);
    }

    function destroy(uint256 issuanceID, uint64 amount) external notRevoked(issuanceID) {
        transfer(issuanceID, 0x0, amount);
    }

    function revoke(uint256 issuanceID) external onlyIssuer {
        issuances[issuanceID].revoked = true;
    }

    function isRevoked(uint256 issuanceID) external constant returns (bool) {
        return issuances[issuanceID].revoked;
    }

    function certificateText(uint256 issuanceID) external constant returns (string) {
        var issuance = issuances[issuanceID];
        return certificateText(issuance.description, issuance.id, issuance.originalSupply, issuance.auditRemark, issuance.liability);
    }



    // Management interface

    function setFee(uint64 newFee) onlyLOBRoot {
        fee = newFee;
    }

    function setLOBRoot(address newRoot) onlyLOBRoot {
        lobRoot = newRoot;
    }

    function withdraw(uint256 amount, address recipient) onlyLOBRoot {
        recipient.transfer(amount);
    }

    function disable() {
        require(msg.sender == lobRoot || msg.sender == issuer);
        disabled = true;
    }
}