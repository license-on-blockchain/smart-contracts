pragma solidity ^0.4.18;

import "./StringUtils.sol";

library LicenseContractLib {
    struct Issuance {
        /*
         * A human-readable description of the type of license managed by this
         * issuance.
         */
        string description;

        /**
         * An unambiguous code for the type of license this issuance 
         * manages.
         * 
         * This could be the SKU of the product used by the software 
         * manufacturer together with the manufacturer's name or a free text 
         * description.
         */
        string code;

        /**
         * The name of the person or organisation to whom the licenses were 
         * originally issued
         */
        string originalOwner;
        
        /**
         * The number of licenses originally issued in this issuance. 
         *
         * This will never change, even if licenses get destroyed.
         */
        uint64 originalSupply;

        /**
         * The date at which the audit was performed.
         *
         * Unix timestamp (seconds since 01/01/1970 +0000)
         */
        uint32 auditTime;

        /**
         * The audit remark that shall be substituted into the audit remark 
         * placeholder of the certificate text for this issuance.
         */
        string auditRemark;

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

    // Mirror event declarations from LicenseContract to allow them to be 
    // emitted from the library
    event Issuing(uint256 issuanceID);
    event Transfer(uint256 issuanceID, address from, address to, uint64 amount, bool reclaimable);
    event Reclaim(uint256 issuanceID, address from, address to, uint64 amount);

    /**
     * Insert a new issuance with the given parameters into the array. Due to 
     * technical limitations, this does not set original supply or initalises
     * the balances mapping.
     */
    function insert(Issuance[] storage issuances, string description, string code, string originalOwner, uint32 auditTime, string auditRemark) public returns (uint256) {
        return issuances.push(Issuance(description, code, originalOwner, 0, auditTime, auditRemark, /*revoked*/false)) - 1;
    }

    /**
     * Assign the originalSupply member of the issuance with the given ID and
     * assign initialOwner all initial licenses. This also emits all 
     * corresponding events.
     */
    function createInitialLicenses(Issuance[] storage issuances, uint256 issuanceID, uint64 originalSupply, address initialOwner) public returns (uint256) {
        var issuance = issuances[issuanceID];
        issuance.originalSupply = originalSupply;
        issuances[issuanceID].balance[initialOwner][initialOwner] = originalSupply;
        Issuing(issuanceID);
        Transfer(issuanceID, 0x0, initialOwner, originalSupply, false);
        return issuanceID;
    }

    function transferFromMessageSender(Issuance[] storage issuances, uint256 issuanceID, address to, uint64 amount) public {
        var issuance = issuances[issuanceID];
        require(!issuance.revoked);
        require(issuance.balance[msg.sender][msg.sender] >= amount);

        issuance.balance[msg.sender][msg.sender] -= amount;
        issuance.balance[to][to] += amount;

        Transfer(issuanceID, /*from*/msg.sender, to, amount, /*reclaimable*/false);
    }

    function transferFromSenderAndAllowReclaim(Issuance[] storage issuances, uint256 issuanceID, address to, uint64 amount) public {
        var issuance = issuances[issuanceID];
        require(!issuance.revoked);
        require(issuance.balance[msg.sender][msg.sender] >= amount);

        issuance.balance[msg.sender][msg.sender] -= amount;
        issuance.balance[to][msg.sender] += amount;
        issuance.reclaimableBalanceCache[to] += amount;

        Transfer(issuanceID, /*from*/msg.sender, to, amount, /*reclaimable*/true);
    }

    function reclaimToSender(Issuance[] storage issuances, uint256 issuanceID, address from, uint64 amount) public {
        var issuance = issuances[issuanceID];
        require(!issuance.revoked);
        require(issuance.balance[from][msg.sender] >= amount);
        
        issuance.balance[from][msg.sender] -= amount;
        issuance.balance[msg.sender][msg.sender] += amount;
        issuance.reclaimableBalanceCache[from] -= amount;

        Reclaim(issuanceID, from, /*to*/msg.sender, amount);
    }

    /**
     * Build the certificate text by filling custom placeholders into a template
     * certificate text.
     *
     * @return The certificate text template with placeholders instantiated by 
     *         the given parameters
     */
    function buildCertificateText(
        string _issuerName,
        address _licenseContractAddress,
        uint8 _safekeepingPeriod,
        string _liability
        ) internal pure returns (string) {
        var s = StringUtils.concat(
            "Wir",
            _issuerName,
            ", bestätigen hiermit, dass\n \nwir unter diesem Ethereum Smart Contract mit der Ethereum-Adresse ",
            StringUtils.addressToString(_licenseContractAddress),
            "(nachfolgend \"LOB-License-Contract\" genannt) Software-Lizenzbescheinigungen gemäß dem Verfahren der License-On-Blockchain Foundation (LOB-Verfahren) ausstellen.\n \nWir halten folgende Bescheinigung für alle mithilfe der Funktion \"issueLicenses\" (und dem Event \"Issuing\" protokollierten) ausgestellten Lizenzen aufrecht, wobei die mit \"<...>\" gekennzeichneten Platzhalter durch die entsprechenden Parameter des Funktionsaufrufs bestimmt werden.\n \n \n                        <LicenseOwner> (nachfolgend als „Lizenzinhaber“ bezeichnet) verfügte am <AuditTime> über <NumLicenses> Lizenzen des Typs <LicenseTypeDescription>.\n \n                        Unser Lizenzaudit hat folgendes ergeben:\n                        <AuditRemark bspw.: „Die Lizenzen wurden erworben über ....,“>\n \n                        Entsprechende Belege und Kaufnachweise wurden uns vorgelegt und werden bei uns für die Dauer von "
        );
        s = StringUtils.concat(s,
            StringUtils.uintToString(_safekeepingPeriod),
            " Jahren archiviert.\n                        Kopien dieser Belege hängen dieser Lizenzbestätigung an.\n \n                        Gleichzeitig wurde uns gegenüber seitens des Lizenzinhabers glaubhaft bestätigt, dass\n                        a) über diese Lizenzen nicht zwischenzeitlich anderweitig verfügt und\n                        b) keine weitere Lizenzbestätigung bei einem anderen Auditor, nach welchem Verfahren auch immer, angefordert wurde.\n \n                        Der Empfänger dieser Lizenzbescheinigung hat uns gegenüber schriftlich zugesichert:\n                        „Ich werde eine allfällige Weitergabe der hiermit bescheinigten Lizenz(en) durch Ausführung der Funktion \"transfer\" in dem LOB-License-Contract mit Ethereum-Adresse ",
            StringUtils.addressToString(_licenseContractAddress),
            " dokumentieren und dem Folgeerwerber eine gleichlautende Obliegenheit unter Verwendung des Wortlauts dieses Absatzes auferlegen. Soll die Übertragung außerhalb des LOB-Verfahrens erfolgen, werde ich zuvor die Bescheinigung der Lizenz durch Übertragung der Lizenz an die Pseudo-Adresse \"0x0000000000000000000000000000000000000000\" terminieren.“.\n \n                        "
        );
        s = StringUtils.concat(s,
            _liability,
            "\n \n \nWir halten unsere Lizenzbescheinigung auch gegenüber jedem aufrecht, dem eine oder mehrere mit dieser Lizenzbescheinigung bestätigte Lizenzen übertragen werden, sofern\na) diese Übertragung innerhalb dieses LOB-License-Contracts mithilfe der Funktion \"transfer\" oder \"transferAndAllowReclaim\" dokumentiert wurde und\nb) der Empfänger der Transaktion sich ebenfalls der o.g. Obliegenheit zur Dokumentation weiterer Veräußerungen auf der Blockchain unterworfen hat.\n \nIm Hinblick auf den abgebenden Lizenzinhaber endet durch eine abgebende Transaktion in jedem Fall die Gültigkeit unserer Bestätigung im Umfang der abgegebenen Lizenz(en).\n \nDie Inhaberschaft der in diesem LOB-License-Contract bescheinigten Lizenz(en) kann von jedermann durch Ausführung der Funktion \"balance\" unter Angabe der entsprechenden issuanceID und der Ethereum-Adresse des vermeintlichen Lizenzinhabers validiert werden.\nDie konkrete Lizenzbescheinigung kann von jedermann durch Ausführung der Funktion \"CertificateText\" auf dem LOB-License-Contract unter Angabe der entsprechenden issuanceID abgerufen werden.\n \nJeder Lizenztransfer im LOB-License-Contract über das Event \"Transfer\" protokolliert und die Lizenzübertragungskette kann durch Inspektion der Transfer-Events auf der Ethereum Blockchain nachvollzogen werden.\n \nZur Ausführung der o.g. Smart-Contract-Functionen und Inspektion der Transfer-Events wird die LOB-Lizenzwallet empfohlen, die von der License-On-Blockchain Foundation unter www.license-on-blockchain.com bereitgestellt wird."
        );
        return s;
    }
}

contract LicenseContract {

    using LicenseContractLib for LicenseContractLib.Issuance[];

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

    /*
     * The liability that shall be substituted into the liability placeholder 
     * of the certificate text.
     */
    string public liability;

    /**
     * The number of years all documents having to do with an audit will be kept
     * safe by the issuer.
     */
    uint8 public safekeepingPeriod;

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
    // TODO: In which format?
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
     * The signature generated by signing the certificate text of this license 
     * contract using the private key of `issuerCertificate`.
     */
    bytes public signature;

    /**
     * The issuances created by this license contract. The issuance with ID `x`
     * is `issuances[x]`.
     */
    LicenseContractLib.Issuance[] public issuances;



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
     * got destroyed.
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
     * Fired when the fee requrired to issue new licenses changes. Fired 
     * initially with the constructor of this contract.
     *
     * @param newFee The new fee that is required every time licenses are issued
     */
    event FeeChange(uint128 newFee);


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
     * @param _liability  The liability that shall be substitute into the
     *                    liability placeholder of the certificate text
     * @param _issuerCertificate An SSL certificate created for the person or 
     *                    organisation that will issue licenses via this 
     *                    contract. See documentation of instance variable 
     *                    `issuerCertificate` for more inforamtion.
     * @param _safekeepingPeriod The amount of years all documents having to do 
     *                           with the audit will be kept by the issuer
     * @param _fee The fee that is taken for each license issuance in wei. May 
     *             be changed later.
     */
    function LicenseContract(
        address _issuer, 
        string _issuerName, 
        string _liability,
        bytes _issuerCertificate,
        uint8 _safekeepingPeriod,
        uint128 _fee
    ) public {
        issuer = _issuer;
        issuerName = _issuerName;
        liability = _liability;
        issuerCertificate = _issuerCertificate;
        safekeepingPeriod = _safekeepingPeriod;
        
        lobRoot = msg.sender;

        fee = _fee;
        FeeChange(_fee);
    }

    /**
    * Sign this license contract, verifying that the private key of this 
    * contract is owned by the owner of the private key for `issuerCertificate`
    * and that the issuer will comply with the LOB rules.
    * 
    * The signature shall sign the text returned by `certificateText` using the
    * private key belonging to `issuerCertificate`.
    * 
    * Prior to signing the license contract, licenses cannot be issued.
    *
    * @param _signature The signature with which to sign the license contract
    */
    // TODO: In which format shall this signature be?
    function sign(bytes _signature) onlyIssuer public {
        // Don't allow resigning of the contract
        // TODO: Would it be desirable to allow resigning?
        require(signature.length == 0);
        signature = _signature;
    }



    // License creation

    /**
    * The certificate text for this license contract, generated by filling in 
    * placeholders into a template certificate text.
    *
    * @return The certificate text for this license contract
    */
    function certificateText() external constant returns (string) {
        return LicenseContractLib.buildCertificateText(issuerName, this, safekeepingPeriod, liability);
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
    * of the struct `LicenseContractLib.Issuance`.
    * 
    * @param description A human-readable description of the license type
    * @param code An unambiguous code for the license type
    * @param originalOwner The name of the person or organisation to whom the
    *                      licenses shall be issued and who may transfer them 
    *                      on
    * @param numLicenses The number of licenses to be issued
    * @param auditRemark A text to be filled into the audit remark placeholder
    * @param auditTime The time at which the audit was performed
    * @param initialOwner The address that shall initially own all the licenses
    *
    * @return The ID of the newly created issuance
    */
    function issueLicense(
        string description,
        string code,
        string originalOwner,
        uint64 numLicenses,
        string auditRemark,
        uint32 auditTime,
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
        var issuanceID = issuances.insert(description, code, originalOwner, auditTime, auditRemark);
        return issuances.createInitialLicenses(issuanceID, numLicenses, initialOwner);
    }



    // License transfer

    /**
     * Return the number of issuances stored in the `issuances` instance 
     * variable.
     *
     * @return The number of elements in the `issuances` instance variable
     */
    function issuancesCount() external constant returns (uint256) {
        return issuances.length;
    }

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
    function transfer(uint256 issuanceID, address to, uint64 amount) public {
        issuances.transferFromMessageSender(issuanceID, to, amount);
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
    function transferAndAllowReclaim(uint256 issuanceID, address to, uint64 amount) external {
        issuances.transferFromSenderAndAllowReclaim(issuanceID, to, amount);
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
    function reclaim(uint256 issuanceID, address from, uint64 amount) external {
        issuances.reclaimToSender(issuanceID, from, amount);
    }

    /**
    * Revoke the given issuance, disallowing any further license transfers or
    * reclaims. This action cannot be undone and can only be 
    * performed by the issuer.
    *
    * @param issuanceID The ID of the issuance that shall be revoked
    */
    function revoke(uint256 issuanceID) external onlyIssuer {
        issuances[issuanceID].revoked = true;
        Revoke(issuanceID);
    }



    // Management interface

    /**
    * Set the fee required for every license issuance to a new amount. This can 
    * only be done by the LOB root.
    *
    * @param newFee The new fee in wei
    */
    function setFee(uint128 newFee) onlyLOBRoot external {
        fee = newFee;
        FeeChange(newFee);
    }

    /**
    * Withdraw Ether that have been collected as fees from the license contract
    * to the address `recipient`. This can only be initiated by the LOB root.
    *
    * @param amount The amount that shall be withdrawn in wei
    * @param recipient The address that shall receive the withdrawal
    */
    function withdraw(uint256 amount, address recipient) onlyLOBRoot external {
        recipient.transfer(amount);
    }

    /**
    * Disable the license contract, disallowing any futher license issuances 
    * while still allowing licenses to be transferred. This action cannnot be 
    * undone. It can only be performed by the LOB root and the issuer.
    */
    function disable() external {
        require(msg.sender == lobRoot || msg.sender == issuer);
        disabled = true;
    }
}