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

        bytes signature;

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

    function certificateText(
		uint64 numLicenses, 
		string licenseDescription, 
		string licenseId, 
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
		bytes signature,
		address initialOwner
	)
		external
		onlyIssuer
		payable
		returns (uint256)
	{
		require(msg.value >= fee);
		require(!disabled);
        var license = Issuance(description, id, numLicenses, auditRemark, liability, signature, /*revoked*/false);
    	issuances.push(license);
    	issuances[issuances.length - 1].balance[initialOwner][initialOwner] = numLicenses;
        Issuing(issuances.length - 1);
    	return issuances.length - 1;
    }



    // Contract transfer

    function balanceOf(uint256 issuanceID, address owner) external constant returns (uint64) {
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
    	return certificateText(issuance.originalSupply, issuance.description, issuance.id, issuance.auditRemark, issuance.liability);
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