pragma solidity ^0.4.15;

contract LicenseContract {

    /// Assert that the message is sent by the contract's issuer.
    modifier onlyIssuer() {
        require(msg.sender == issuer);
        _;
    }

    /// Assert that the message is sent by the LOB root of this contract.
    modifier onlyLOBRoot() {
        require(msg.sender == lobRoot);
        _;
    }

    // TODO: Is the contract smaller/cheaper to execute if we access the 
    //       issuance variable that almost always exists instead of doing an 
    //       additional array lookup?
    /// Assert that the issuance with the given ID has not been revoked.
    modifier notRevoked(uint256 issuanceID) {
        require(!issuances[issuanceID].revoked);
        _;
    }

    struct Issuance {
        /*
         * A human-readable description of the type of license managed by this
         * issuance.
         */
        string description;

        /**
         * An unambiguous identifier for the type of license this issuance 
         * manages.
         * 
         * This could be the SKU of the product used by the software 
         * manufacturer together with the manufacturer's name or a free text 
         * description.
         */
        string id;
        
        /**
         * The number of licenses originally issued in this issuance. 
         *
         * This will never change, even if licenses get destroyed.
         */
        uint64 originalSupply;

        /**
         * The audit remark that shall be substitute into the audit remark 
         * placeholder of the certificate text for this issuance.
         */
        string auditRemark;

        /**
         * The liability that shall be substitute into the liability placeholder 
         * of the certificate text for this issuance.
         */
        string liability;

        /** 
         * Whether or not the issuance has been revoked, thus not allowing any
         * more license transfers.
         */
        bool revoked;

        /**
         * Main data structure managing who owns how many licenses.
         *
         * `balance[x][y] == value` means that `x` owns `value` licenses but `y`
         * is allowed to reclaim them at any moment, transferring `value` 
         * licenses to his account.
         * If `x == y`, `x` properly owns the license and nobody is allowed to 
         * reclaim them.
         *
         * Licenses owned by `0x0` have been destroyed.
         *
         * The following invariant always holds:
         * `sum_{x, y} (balance[x][y]) == totalSupply`
         */
        mapping (address => mapping(address => uint64)) balance;

        /**
         * A cached value to speed up the calculation of the total number of 
         * licenses currently owned by an address.
         *
         * `reclaimableBalanceCache[x] = sum_{y, y != x} (balance[x][y])`, i.e.
         * `reclaimableBalanceCache` manages the number of licenses currently 
         * owned by `x` that may be reclaimed by someone else.
         *
         * The total number of licenses owned by an address `x` is thus
         * `reclaimableBalanceCache[x] + balance[x][x]`.
         */
        mapping (address => uint64) reclaimableBalanceCache;
    }

    /**
     * A human readable name that unambiguously describes the person or 
     * organisation issuing licenses via this contract. 
     * This should to the most possible extend match the name in the 
     * `issuerCertificate`. Ideally, `issuerCertificate` is a Class 3 EV 
     * certificateis and issued to exactly this name. Should `issuerCertificate` 
     * be class 2 only, the URL contained in the certificate should obviously
     * refer to the website of this person or organisation.
     * It is not validated on the blockchain if this invariant holds but should 
     * be done in wallet software or by the user.
     */
    string public issuerName;

    /**
     * An SSL certificate that identifies the owner of this license contract.
     * The private key of this certificate is used to generate the signature
     * for this license contract. See the documentation of `issuerName` for the 
     * constraints on how the name in this certificate should match the name 
     * stored in `issuerName`.
     *
     * It is not verified on the blockchain if this certificate is in the 
     * correct format.
     */
    // TODO: In which format
    bytes public issuerCertificate; 

    /**
     * The fee in wei that is required to be payed for every license issuance. 
     * The fees are collected in the contract and may be withdrawn by the LOB 
     * root.
     */
    uint128 public fee;

    /**
     * The LOB root address that is allowed to set the fee, withdraw fees and 
     * disable this license contract. Initially, it is the creator of this 
     * contract, but may be set to a different address by the LOB root at any
     * point.
     */
    address public lobRoot;

    /**
     * The address that is allowed to issue and revoke licenses via this license
     * contract.
     */
    address public issuer;

    /**
     * Whether or not this license contract has been disabled and thus disallows
     * any further issuings.
     */
    bool public disabled;

    /**
     * The signature generated by signing the address of this token contract 
     * using the private key of `issuerCertificate`.
     */
    // TODO: What exactly should this signature contain apart from the 
    // contract's address?
    bytes public signature;

    /**
     * The issuances created by this license contract. The issuance with ID `x`
     * is `issuances[x]`.
     */
    Issuance[] issuances;



    // Events

    /**
     * Fired every time new licenses are issued. 
     *
     * @param issuanceID The ID of the newly created issuance
     */
    event Issuing(uint256 issuanceID);

    /**
     * Fired every time license are transferred. A transfer from `0x0` is fired
     * upon the issuance of licenses and a transfer to `0x0` means that licenses
     * get destroyed.
     *
     * @param issuanceID The issuance in which licenses are transferred
     * @param from The address that previously owned the licenses
     * @param to The address that the licenses are transferred to
     * @param amount The number of licenses transferred in this transfer
     * @param reclaimable Whether or not `from` is allowed to reclaim the 
     *                    transferred licenses
     */
    event Transfer(uint256 issuanceID, address from, address to, uint64 amount, bool reclaimable);

    /**
     * Fired every time an address reclaims that were previously transferred 
     * with the right to be reclaimed.
     *
     * @param issuanceID The issuance in which licenses are transferred
     * @param from The address to whom the licenses were previously transferred
     * @param to The address that now reclaims the licenses
     * @param amount The number of licenses `to` reclaims from `from`
     */
    event Reclaim(uint256 issuanceID, address from, address to, uint64 amount);

    /**
     * Fired when an issuance gets revoked by the issuer.
     *
     * @param issuanceID The issuance that gets revoked
     */
    event Revoke(uint256 issuanceID);

    /**
     * Fired when the address of the LOB root changes. This is also fired upon
     * contract creation with the initial LOB root.
     *
     * @param newRoot The address of the new LOB root
     */
    event LOBRootChange(address newRoot);


    // Constructor

    /**
     * Create a new license contract. The sender of this message is the initial 
     * LOB root.
     *
     * @param _issuer The address that will be allowed to issue licenses via 
     *                this contract
     * @param _issuerName The name of the person or organisation that will issue
     *                    licenses via this contract. See documentation of 
     *                    instance variable `issuerName` for more inforamtion.
     * @param _issuerCertificate An SSL certificate created for the person or 
     *                    organisation that will issue licenses via this 
     *                    contract. See documentation of instance variable 
     *                    `issuerCertificate` for more inforamtion.
     * @param _fee The fee that is taken for each license issuance in wei. May 
     *             be changed later.
     */
    function LicenseContract(
        address _issuer, 
        string _issuerName, 
        bytes _issuerCertificate, 
        uint128 _fee
    ) {
        lobRoot = msg.sender;
        LOBRootChange(msg.sender);

        issuer = _issuer;
        issuerName = _issuerName;
        issuerCertificate = _issuerCertificate;
        fee = _fee;
    }

    /**
     * Sign this license contract, verifying that the private key of this 
     * contract is owned by the owner of the private key for `issuerCertificate`
     * and that the issuer will comply with the LOB rules.
     * 
     * The signature must contain the address of this token contract.
     * 
     * Prior to signing the license contract, licenses cannot be issued.
     *
     * @param _signature The signature with which to sign the license contract
     */
    // TODO: In which format shall this signature be?
    // TODO: What exactly shall the signature contain?
    function sign(bytes _signature) onlyIssuer {
        // Don't allow resigning of the contract
        // TODO: Would it be desirable to allow resigning?
        require(signature.length == 0);
        signature = _signature;
    }

    // License creation

    /**
     * The certificate text for a license issuance, generated by filling in 
     * placeholders into a template certificate text.
     * 
     * For a more detailed description of the parameters see the documentation
     * of the struct `Issuance`.
     *
     * @param licenseDescription A human-readable description of the license type
     * @param licenseId An unambiguous identifier for the license type
     * @param numLicenses The number of licenses in the issuance
     * @param auditRemark A text to be filled into the audit remark placeholder
     * @param liability A text to be filled into the liability placeholder
     *
     * @return The certificate text template with all placeholders instantiated
     */
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

    /**
     * Issue new LOB licenses. The following conditions must be satisfied for 
     * this function to be called:
     *  - The fee must be transmitted together with this message
     *  - The function must be called by the issuer
     *  - The license contract must not be disabled
     *
     * It will create a new issuance whose ID is returned by the function. The 
     * event `Issuing` is also fired with the ID of the newly created issuance.
     * For a more detailed description of the parameters see the documentation
     * of the struct `Issuance`.
     * 
     * @param description A human-readable description of the license type
     * @param id An unambiguous identifier for the license type
     * @param numLicenses The number of licenses to be issued
     * @param auditRemark A text to be filled into the audit remark placeholder
     * @param liability A text to be filled into the liability placeholder
     * @param initialOwner The address that shall initially own all the licenses
     *
     * @return The ID of the newly created issuance
     */
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

    /**
     * Helper method for `issueLicense` to circumvent the issue that too many
     * variables would be used in `issueLicense`.
     */
    function issueLicenseImpl(Issuance issuance, address initialOwner) private returns (uint256) {
        var issuanceID = issuances.push(issuance) - 1;
        issuances[issuanceID].balance[initialOwner][initialOwner] = issuance.originalSupply;
        Issuing(issuanceID);
        Transfer(issuanceID, 0x0, initialOwner, issuance.originalSupply, false);
        return issuanceID;
    }



    // Contract transfer

    /**
     * Determine the number of licenses of a given issuance owned by `owner` 
     * including licenses that may be reclaimed by a different address.
     *
     * @param issuanceID The issuance for which the number of licenses owned by
     *                   `owner` shall be determined
     * @param owner The address for which the balance shall be determined
     * 
     * @return The number of licenses owned by `owner`
     */
    function balance(uint256 issuanceID, address owner) external constant returns (uint64) {
        var issuance = issuances[issuanceID];
        return issuance.balance[owner][owner] + issuance.reclaimableBalanceCache[owner];
    }

    /**
     * Determine the number of licenses of a given issuance owned by `owner` 
     * but which may be reclaimed by a different address (i.e. excluding 
     * licenses that are properly owned by `owner`).
     *
     * @param issuanceID The issuance for which the balance shall be determined
     * @param owner The address for which the balance shall be determined
     * 
     * @return The number of licenses owned by `owner` but which may be 
     *         reclaimed by someone else
     */
    function reclaimableBalance(uint256 issuanceID, address owner) external constant returns (uint64) {
        return issuances[issuanceID].reclaimableBalanceCache[owner];
    }

    /**
     * Determine the number of licenses of a given issuance owned by `owner` 
     * but which may be reclaimed by `reclaimer`.
     *
     * @param issuanceID The issuance for which the balance shall be determined
     * @param owner The address for which the balance shall be determined
     * @param reclaimer The address that shall be allowed to reclaim licenses 
     *                  from `owner`
     * 
     * @return The number of licenses owned by `owner` but which may be 
     *         reclaimed by `reclaimer`
     */
    function reclaimableBalanceBy(uint256 issuanceID, address owner, address reclaimer) external constant returns (uint64) {
        return issuances[issuanceID].balance[owner][reclaimer];
    }

    /**
     * Transfer `amount` licenses of the given issuance from the sender's 
     * address to `to`. `to` becomes the new proper owner of these licenses.
     *
     * This requires that:
     *  - The sender properly owns at least `amount` licenses of the given 
     *    issuance
     *  - The issuance has not been revoked
     *
     * Upon successful transfer, this fires the `Transfer` event with 
     * `reclaimable` set to `false`.
     *
     * @param issuanceID The issuance out of which licenses shall be transferred
     * @param to The address the licenses shall be transferred to
     * @param amount The number of licenses that shall be transferred
     */
    function transfer(uint256 issuanceID, address to, uint64 amount) public notRevoked(issuanceID) {
        var issuance = issuances[issuanceID];
        require(issuance.balance[msg.sender][msg.sender] >= amount);

        issuance.balance[msg.sender][msg.sender] -= amount;
        issuance.balance[to][to] += amount;

        Transfer(issuanceID, /*from*/msg.sender, to, amount, /*reclaimable*/false);
    }

    /**
     * Transfer `amount` licenses of the given issuance from the sender's 
     * address to `to`. `to` becomes a temporary owner of the licenses and the 
     * sender is allowed to reclaim the licenses at any point. `to` is not 
     * allowed to transfer these licenses to anyone else.
     *
     * This requires that:
     *  - The sender properly owns at least `amount` licenses of the given 
     *    issuance
     *  - The issuance has not been revoked
     *
     * Upon successful transfer, this fires the `Transfer` event with 
     * `reclaimable` set to `true`.
     *
     * @param issuanceID The issuance out of which licenses shall be transferred
     * @param to The address the licenses shall be transferred to
     * @param amount The number of licenses that shall be transferred
     */
    function transferAndAllowReclaim(uint256 issuanceID, address to, uint64 amount) external notRevoked(issuanceID) {
        var issuance = issuances[issuanceID];
        require(issuance.balance[msg.sender][msg.sender] >= amount);

        issuance.balance[msg.sender][msg.sender] -= amount;
        issuance.balance[to][msg.sender] += amount;
        issuance.reclaimableBalanceCache[to] += amount;

        Transfer(issuanceID, /*from*/msg.sender, to, amount, /*reclaimable*/true);
    }

    /**
     * The sender reclaims `amount` licenses it has previously transferred to 
     * `from` using `transferAndAllowReclaim`, deducting them from `from`'s 
     * reclaimable balance and adding them to the sender's proper balance again.
     *
     * This requires that:
     *  - The sender previously transferred at least `amount` licenses to `from`
     *    with the right to reclaim them
     *  - The issuance has not been revoked
     *
     * Upon successful reclaim, the `Reclaim` event is fired.
     *
     * @param issuanceID The issuance out of which licenses shall be reclaimed
     * @param from The address from which licenses shall be reclaimed
     * @param amount The number of licenses that shall be reclaimed
     */
    function reclaim(uint256 issuanceID, address from, uint64 amount) external notRevoked(issuanceID) {
        var issuance = issuances[issuanceID];
        require(issuance.balance[from][msg.sender] >= amount);
        
        issuance.balance[from][msg.sender] -= amount;
        issuance.balance[msg.sender][msg.sender] += amount;
        issuance.reclaimableBalanceCache[from] -= amount;

        Reclaim(issuanceID, from, /*to*/msg.sender, amount);
    }

    /**
     * Destroy `amount` licenses of the given issuance that are currently owned
     * by the sender. This destroy is represented by a transfer to the "trash" 
     * address `0x0`.
     *
     * This requires that:
     *  - The sender properly owns at least `amount` licenses of the given 
     *    issuance
     *  - The issuance has not been revoked
     *
     * Upon successful transfer, this fires the `Transfer` event with 
     * `reclaimable` set to `false` and to address `0x0`.
     *
     * @param issuanceID The issuance out of which licenses shall be destroyed
     * @param amount The number of licenses that shall be destroyed
     */
    function destroy(uint256 issuanceID, uint64 amount) external {
        // Simply transfer the licenses to the "trash" address 0x0. This also 
        // requires that the issuance has not been revoked
        transfer(issuanceID, 0x0, amount);
    }

    /**
     * Revoke the given issuance, disallowing any further license transfers, 
     * reclaims or destroys. This action cannot be undone and can only be 
     * performed by the issuer.
     *
     * @param issuanceID The ID of the issuance that shall be revoked
     */
    function revoke(uint256 issuanceID) external onlyIssuer {
        issuances[issuanceID].revoked = true;
    }

    /**
     * Determine if an issuance has been revoked
     * 
     * @param issuanceID The ID of the issuance for which shall be determined if 
     *                   it has been revoked
     *
     * @return Whether or not the given issuance has been revoked
     */
    function isRevoked(uint256 issuanceID) external constant returns (bool) {
        return issuances[issuanceID].revoked;
    }

    /**
     * Build and return the certificate text for a given issuance.
     * 
     * @param issuanceID The id of the issuance for which the certificate text 
     *                   shall be determined
     * 
     * @return The certificate text for the given issuance
     */
    function certificateText(uint256 issuanceID) external constant returns (string) {
        var issuance = issuances[issuanceID];
        return certificateText(issuance.description, issuance.id, issuance.originalSupply, issuance.auditRemark, issuance.liability);
    }



    // Management interface

    /**
     * Set the fee required for every license issuance to a new amount. This can 
     * only be done by the LOB root.
     *
     * @param newFee The new fee in wei
     */
    function setFee(uint128 newFee) onlyLOBRoot {
        fee = newFee;
    }

    /**
     * Set the LOB root to a new address. This can only be done by the current 
     * LOB root.
     * 
     * @param newRoot The address of the new LOB root
     */
    function setLOBRoot(address newRoot) onlyLOBRoot {
        lobRoot = newRoot;
        LOBRootChange(newRoot);
    }

    /**
     * Withdraw Ether that have been collected as fees from the license contract
     * to the address `recipient`. This can only be initiated by the LOB root.
     *
     * @param amount The amount that shall be withdrawn in wei
     * @param recipient The address that shall receive the withdrawal
     */
    function withdraw(uint256 amount, address recipient) onlyLOBRoot {
        recipient.transfer(amount);
    }

    /**
     * Disable the license contract, disallowing any futher license issuances 
     * while still allowing licenses to be transferred. This action cannnot be 
     * undone. It can only be performed by the LOB root and the issuer.
     */
    function disable() {
        require(msg.sender == lobRoot || msg.sender == issuer);
        disabled = true;
    }
}