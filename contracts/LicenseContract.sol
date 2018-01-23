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
         * The number of licenses originally issued in this issuance. 
         *
         * This will never change, even if licenses get destroyed.
         */
        uint64 originalSupply;

        /**
         * The date at which the audit was performed.
         *
         * Unix timestamp (seconds since 01/01/1970 00:00 +0000)
         */
        uint32 auditTime;

        /**
         * A free text field containing the result of the license audit.
         */
        string auditRemark;

        /** 
         * Whether or not this issuance has been revoked, thus not allowing any
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
         * `temporaryBalance[x] = sum_{y, y != x} (balance[x][y])`, i.e.
         * `temporaryBalance` manages the number of licenses currently 
         * owned by `x` that may be reclaimed by someone else.
         *
         * The total number of licenses owned by an address `x` is thus
         * `temporaryBalance[x] + balance[x][x]`.
         */
        mapping (address => uint64) temporaryBalance;

        /**
         * A list of addresses to which licenses have been transferred 
         * temporarily.
         *
         * This is an auxiliary list to determine the addresses from which 
         * licenses may be reclaimed. Whenever `x` has transferred a licenses
         * to `y` with the right to reclaim it, `y` will be in 
         * `temporaryLicenseHolders[x]`. The list is  never cleared, thus the 
         * existance of an address in the list does not guarantee that a reclaim 
         * is possible (e.g. if the licenses has already been reclaimed).
         * Addresses may occur multiple times in the list, since it is only 
         * appended to.
         */
        mapping (address => address[]) temporaryLicenseHolders;
    }

    // Mirror event declarations from LicenseContract to allow them to be 
    // emitted from the library
    event Issuing(uint256 issuanceNumber);
    event Transfer(uint256 issuanceNumber, address from, address to, uint64 amount, bool reclaimable);
    event Reclaim(uint256 issuanceNumber, address from, address to, uint64 amount);

    /**
     * Insert a new issuance with the given parameters into the array. Due to 
     * technical limitations, this does not set original supply or initalises
     * the balances mapping.
     */
    function insert(Issuance[] storage issuances, string description, string code, uint32 auditTime, string auditRemark) public returns (uint256) {
        // Passing originalSupply would exceed the number of allowed parameters
        // it is thus set in `createInitialLicenses`.
        return issuances.push(Issuance(description, code, /*originalSupply*/0, auditTime, auditRemark, /*revoked*/false)) - 1;
    }

    /**
     * Assign the originalSupply member of the issuance with the given issuance
     * number and assign `initialOwnerAddress` all initial licenses. This also 
     * emits all corresponding events.
     */
    function createInitialLicenses(Issuance[] storage issuances, uint256 issuanceNumber, uint64 originalSupply, address initialOwnerAddress) public returns (uint256) {
        var issuance = issuances[issuanceNumber];
        issuance.originalSupply = originalSupply;
        issuances[issuanceNumber].balance[initialOwnerAddress][initialOwnerAddress] = originalSupply;
        Issuing(issuanceNumber);
        Transfer(issuanceNumber, 0x0, initialOwnerAddress, originalSupply, false);
        return issuanceNumber;
    }

    function transferFromMessageSender(Issuance[] storage issuances, uint256 issuanceNumber, address to, uint64 amount) internal {
        var issuance = issuances[issuanceNumber];
        require(!issuance.revoked);
        require(issuance.balance[msg.sender][msg.sender] >= amount);

        issuance.balance[msg.sender][msg.sender] -= amount;
        issuance.balance[to][to] += amount;

        Transfer(issuanceNumber, /*from*/msg.sender, to, amount, /*reclaimable*/false);
    }

    function transferTemporarilyFromMessageSender(Issuance[] storage issuances, uint256 issuanceNumber, address to, uint64 amount) internal {
        var issuance = issuances[issuanceNumber];
        require(!issuance.revoked);
        require(issuance.balance[msg.sender][msg.sender] >= amount);
        require(to != msg.sender);

        issuance.balance[msg.sender][msg.sender] -= amount;
        issuance.balance[to][msg.sender] += amount;
        issuance.temporaryBalance[to] += amount;
        issuance.temporaryLicenseHolders[msg.sender].push(to);

        Transfer(issuanceNumber, /*from*/msg.sender, to, amount, /*reclaimable*/true);
    }

    function reclaimToSender(Issuance[] storage issuances, uint256 issuanceNumber, address from, uint64 amount) public {
        var issuance = issuances[issuanceNumber];
        require(!issuance.revoked);
        require(issuance.balance[from][msg.sender] >= amount);
        require(from != msg.sender);
        
        issuance.balance[from][msg.sender] -= amount;
        issuance.balance[msg.sender][msg.sender] += amount;
        issuance.temporaryBalance[from] -= amount;

        Reclaim(issuanceNumber, from, /*to*/msg.sender, amount);
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
     * Asserts that the message is sent by the issuer if `managerAddress` is 
     * `0x0` or `managerAddress` if it is not `0x0`.
     */
    modifier onlyCurrentManager() {
        require((msg.sender == issuer && managerAddress == address(0)) || msg.sender == managerAddress);
        _;
    }

    /**
     * A human readable name that unambiguously describes the person or 
     * organisation issuing licenses via this contract. 
     * This should to the most possible extend match the name in the 
     * `issuerSSLCertificate`. Ideally, `issuerSSLCertificate` is a Class 3 EV 
     * certificateis and issued to exactly this name. Should
     * `issuerSSLCertificate` be class 2 only, the URL contained in the 
     * certificate should obviously refer to the website of this person or 
     * organisation.
     * It is not validated on the blockchain if this invariant holds but should 
     * be done in wallet software or by the user.
     */
    string public issuerName;

    /*
     * The liability the issuer guarantees for each issuance.
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
     *
     * The certificate needs to be PKCS#12 encoded and encrypted with an empty 
     * password.
     */
    bytes public issuerSSLCertificate;

    /**
     * The fee in wei that is required to be payed for every license issuance. 
     * The fees are collected in the license contract and may be withdrawn by 
     * the LOB root.
     */
    uint128 public issuanceFee;

    /**
     * The LOB root address that is allowed to set the issuance fee, withdraw 
     * fees and take over control for this license contract. 
     * Equal to the creator of this contract.
     */
    address public lobRoot;

    /**
     * The address that is allowed to issue and revoke licenses via this license
     * contract.
     */
    address public issuer;

    /**
     * Whether or not this license contract has been disabled and thus disallows
     * any further issuings and revokes by the issuer. If control is taken over 
     * by the root contract's owner, the manager may still revoke licenses.
     */
    bool public disabled;

    /**
     * The signature generated by signing the certificate text of this license 
     * contract using the private key of `issuerSSLCertificate`.
     */
    bytes public signature;

    /**
     * The issuances created by this license contract. The issuance with 
     * issuance number `x` is `issuances[x]`.
     */
    LicenseContractLib.Issuance[] public issuances;

    /**
     * A list of all the issuance numbers for which the given address has ever 
     * owned a license.
     *
     * This list is never cleared, and the existance of an issuance number in it 
     * does not guarantee that the address currently owns licenses of this type.
     * Also, issuance numbers may occur multiple times.
     */
    mapping(address => uint256[]) public relevantIssuances;

    /**
     * If the LOB root has taken over control for this license contract, this is
     * the address that now manages the contract and thus has the right to 
     * revoke licenses and disable the contract.
     *
     * If the address is `0x0`, the LOB root has not taken over control.
     */
    address public managerAddress;


    // Events

    /**
     * Fired every time new licenses are issued. 
     *
     * @param issuanceNumber The issuance number of the newly created issuance
     */
    event Issuing(uint256 issuanceNumber);

    /**
     * Fired every time license are transferred. A transfer from `0x0` is fired
     * upon the issuance of licenses and a transfer to `0x0` means that licenses
     * got destroyed.
     *
     * @param issuanceNumber The issuance to which the transferred licenses
     *                       belong
     * @param from The address that previously owned the licenses
     * @param to The address that the licenses are transferred to
     * @param amount The number of licenses transferred in this transfer
     * @param reclaimable Whether or not `from` is allowed to reclaim the 
     *                    transferred licenses
     */
    event Transfer(uint256 issuanceNumber, address from, address to, uint64 amount, bool reclaimable);

    /**
     * Fired every time an address reclaims licenses that were previously 
     * transferred temporarily.
     *
     * @param issuanceNumber The issuance to which the reclaimed licenses belong
     * @param from The address to whom the licenses were previously transferred
     * @param to The address that now reclaims the licenses
     * @param amount The number of licenses `to` reclaims from `from`
     */
    event Reclaim(uint256 issuanceNumber, address from, address to, uint64 amount);

    /**
     * Fired when an issuance gets revoked by the issuer.
     *
     * @param issuanceNumber The issuance that gets revoked
     */
    event Revoke(uint256 issuanceNumber);

    /**
     * Fired when the issuance fee required to issue new licenses changes. Fired 
     * with the default issuance fee from the constructor of this contract.
     *
     * @param newFee The new fee that is required every time licenses are issued
     */
    event IssuanceFeeChange(uint128 newFee);

    /**
     * Fired when the smart contract gets signed.
     */
    event Signing();

    /**
     * Fired when the smart contract gets disabled.
     */
    event Disabling();

    /**
     * Fired when LOB takes over control for this license contract.
     *
     * @param managerAddress The address that now manages the contract. `0x0` if
     *                       control is passed back to the issuer.
     */
    event ManagementControlTakeOver(address managerAddress);


    // Constructor

    /**
     * Create a new license contract. The sender of this message is the initial 
     * LOB root. Should only be invoked by the root contract.
     *
     * @param _issuer The address that will be allowed to issue licenses via 
     *                this contract
     * @param _issuerName The name of the person or organisation that will issue
     *                    licenses via this contract. See documentation of 
     *                    instance variable `issuerName` for more information.
     * @param _liability  The liability the issuer guarantees for each issuance
     * @param _safekeepingPeriod The number of years all documents having to do 
     *                           with the audit will be kept by the issuer
     * @param _issuerSSLCertificate An SSL certificate created for the person or 
     *                              organisation that will issue licenses via 
     *                              this contract. See documentation of instance 
     *                              variable `issuerSSLCertificate` for more 
     *                              information.
     * @param _issuanceFee The fee that is required to be paid for each license 
     *                     issuance. In Wei. May be changed later.
     */
    function LicenseContract(
        address _issuer, 
        string _issuerName, 
        string _liability,
        uint8 _safekeepingPeriod,
        bytes _issuerSSLCertificate,
        uint128 _issuanceFee
    ) public {
        issuer = _issuer;
        issuerName = _issuerName;
        liability = _liability;
        issuerSSLCertificate = _issuerSSLCertificate;
        safekeepingPeriod = _safekeepingPeriod;
        
        lobRoot = msg.sender;

        issuanceFee = _issuanceFee;
        IssuanceFeeChange(_issuanceFee);
    }

    /**
     * Build the certificate text by filling custom placeholders into a template
     * certificate text.
     *
     * This is the text that needs to be signed to generate the signature for 
     * the `sign` method.
     *
     * @return The certificate text template with placeholders instantiated by 
     *         the given parameters
     */
    function certificateText() external constant returns (string) {
        var s = StringUtils.concat(
            "Wir, ",
            issuerName,
            ", erklären hiermit,\n\ndass wir unter dem Ethereum Smart Contract mit der Ethereum-Adresse „",
            StringUtils.addressToString(this),
            "“ (nachfolgend „LOB-License-Contract“ genannt) Software-Lizenzbescheinigungen gemäß dem Verfahren der License-On-Blockchain Foundation („LOB-Verfahren“) ausstellen.\nEine detaillierte Spezifikation des Verfahrens kann unter der URL <#TODO#> abgerufen werden. Das Dokument hat den Hash-Wert <#TODO#>.\n\nGemäß diesem LOB-Verfahren unterwerfen wir uns insbesondere folgenden Obliegenheiten:\n- Wir werden Software-Lizenzbescheinigungen nur ausstellen, wenn uns seitens des Lizenzinhabers glaubhaft bestätigt wird, dass (a) über diese Lizenzen nicht zwischenzeitlich anderweitig verfügt und (b) keine weitere Lizenzbestätigung bei einem anderen Auditor, nach welchem Verfahren auch immer, angefordert wurde\n- Wir werden uns von den Empfängern unserer Lizenzbescheinigungen schriftlich und nachweisbar wortwörtlich zusichern lassen: „Ich werde eine Weitergabe der hiermit bescheinigten Lizenz(en) auf dem License Contract durch dafür vorgesehenen Funktionen dokumentieren. Soll die Übertragung außerhalb des LOB-Verfahrens erfolgen, werde ich zuvor die Bescheinigung der Lizenz durch Übertragung der Lizenz an die Pseudo-Adresse ‚0x0000000000000000000000000000000000000000‘ terminieren. Dem Folgeerwerber werde ich eine gleichlautende Obliegenheit unter Verwendung des Wortlauts dieses Absatzes auferlegen.“\n- Wir halten unsere Lizenzbescheinigung auch gegenüber jedem aufrecht, dem eine oder mehrere mit dieser Lizenzbescheinigung bestätigte Lizenzen übertragen werden, sofern (a) diese Übertragung innerhalb dieses LOB-License-Contracts mithilfe der Funktion „transfer“ oder „transferTemporarily“ dokumentiert wurde und (b) der Empfänger der Transaktion sich ebenfalls der o.g. Obliegenheit zur Dokumentation weiterer Veräußerungen auf der Blockchain unterworfen hat.\n- Im Hinblick auf den abgebenden Lizenzinhaber endet durch eine abgebende Transaktion in jedem Fall die Gültigkeit unserer Bestätigung im Umfang der abgegebenen Lizenz(en).\n\nUns vorgelegte Belege und Kaufnachweise zu den von uns bescheinigten Lizenzen werden bei uns für die Dauer von ");
        s = StringUtils.concat(
            s,
            StringUtils.uintToString(safekeepingPeriod),
            " Jahren archiviert.\n\n",
            liability);
        return s;
    }

    /**
    * Sign this license contract, verifying that the private key of this 
    * contract is owned by the owner of the private key for 
    * `issuerSSLCertificate` and that the issuer will comply with the LOB rules.
    * 
    * The signature shall sign the text returned by `certificateText` using the
    * private key belonging to `issuerSSLCertificate`. It is a SHA-256 digest of 
    * the certificate text signed using the private key of the SSL certificate
    * and can be generated using OpenSSL with the following command: 
    * openssl dgst -sha256 -sign privateKey.key -hex CertificateText.txt
    * 
    * Prior to signing the license contract, licenses cannot be issued.
    *
    * It is not verified on the blockchain that the signature is valid or 
    * well-formed but this should be done in the wallet.
    *
    * The signature cannot be overwritten once it is set.
    *
    * @param _signature The signature with which to sign the license contract
    */
    function sign(bytes _signature) onlyIssuer external {
        // Don't allow resigning of the contract
        require(signature.length == 0);
        Signing();
        signature = _signature;
    }



    // License creation

    /**
    * Issue new LOB licenses. The following conditions must be satisfied for 
    * this function to succeed:
    *  - The issuance fee must be transmitted together with this message
    *  - The function must be called by the issuer
    *  - The license contract must not be disabled
    *  - The license contract needs to be signed
    *  - LOB must not have taken over control for the license contract
    *
    * It will create a new issuance whose issuance number is returned by the 
    * function. The event `Issuing` is also fired with the issuance number of 
    * the newly created issuance.
    * For a more detailed description of the parameters see the documentation
    * of the struct `LicenseContractLib.Issuance`.
    * 
    * @param description A human-readable description of the license type
    * @param code An unambiguous code for the license type
    * @param initialOwnerAddress The address that shall initially own all the 
    *                            licenses
    * @param numLicenses The number of separately tradable licenses to be issued
    * @param auditRemark A free text field containing the result of the license 
    *                    audit
    * @param auditTime The time at which the audit was performed
    *
    * @return The issuance number of the newly created issuance
    */
    function issueLicense(
        string description,
        string code,
        address initialOwnerAddress,
        uint64 numLicenses,
        string auditRemark,
        uint32 auditTime
    )
        external
        onlyIssuer
        payable
        returns (uint256)
    {
        require(!disabled);
        require(managerAddress == address(0));
        // The license contract hasn't be initialised completely if it has not 
        // been signed. Thus disallow issuing licenses.
        require(signature.length != 0);
        require(msg.value >= issuanceFee);
        var issuanceNumber = issuances.insert(description, code, auditTime, auditRemark);
        relevantIssuances[initialOwnerAddress].push(issuanceNumber);
        return issuances.createInitialLicenses(issuanceNumber, numLicenses, initialOwnerAddress);
    }



    // Caches

    /**
     * Return the number of issuances relevant for the given owner that can be
     * retrieved using `relevantIssuances(owner, i)` where 
     * `i < relevantIssuancesCount(owner)`. 
     *
     * Note that because `relevantIssuances` may contain duplicate and outdated 
     * entries, the number of actually relevant issuances for this owner may be 
     * smaller than the number returned by this method.
     *
     * @param owner The owner for which relevant issuances shall be determined
     *
     * @return The maximum index `i` that can be used when accessing 
     *         `relevantIssuances(owner, i)`
     */
    function relevantIssuancesCount(address owner) external constant returns (uint256) {
        return relevantIssuances[owner].length;
    }

    /**
     * Return the number of addresses from which `originalOwner` may be able to 
     * reclaim licenses of issuance `issuanceNumber`. These addresses can be
     * retrieved using `temporaryLicenseHolders`.
     *
     * Note that because `temporaryLicenseHolders` may contain duplicate entries 
     * and is never cleared, the number of addresses `originalOwner` is able to 
     * reclaim licenses from is likely lower than the count returned by this 
     * function.
     *
     * @param issuanceNumber The issuance for which the addresses from which 
     *                       licenses may be reclaimable shall be determined
     * @param originalOwner The address that would like to reclaim licenses
     *
     * @return An upper bound (exclusive) on the index for 
     *         `temporaryLicenseHolders`
     */
    function temporaryLicenseHoldersCount(uint256 issuanceNumber, address originalOwner) external constant returns (uint256) {
        return issuances[issuanceNumber].temporaryLicenseHolders[originalOwner].length;
    }

    /**
     * Return the `index`th address from which licenses may be reclaimable by
     * `originalOwner`. The maximum index can be determined using 
     * `temporaryLicenseHoldersCount`.
     *
     * `temporaryLicenseHolders` is a list of addresses to which licenses have 
     * been transferred with the right to reclaim them. 
     *
     * It is an auxiliary list to determine the addresses from which 
     * licenses may be reclaimed. Whenever `x` has transferred a licenses
     * to `y` with the right to reclaim it, `y` will be in 
     * `temporaryLicenseHolders[x]`. The list is  never cleared, thus the 
     * existence of an address in the list does not guarantee that a reclaim is 
     * possible (e.g. if the licenses has already been reclaimed).
     * Addresses may occur multiple times in the list, since it is only 
     * appended to.
     *
     * @param issuanceNumber The issuance for which addresses from which
     *                       licenses may be reclaimable shall be determined
     * @param originalOwner The address that would like to reclaim licenses
     * @param index The array index that shall be retrieved. Must be smaller 
     *              than the count returned by
     *              `temporaryLicenseHoldersCount`
     *
     * @return An address from which `originalOwner` may be able to reclaim 
     *         licenses of the given issuance number
     */
    function temporaryLicenseHolders(uint256 issuanceNumber, address originalOwner, uint256 index) external constant returns (address) {
        return issuances[issuanceNumber].temporaryLicenseHolders[originalOwner][index];
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
    * @param issuanceNumber The issuance for which the number of licenses owned 
    *                       by `owner` shall be determined
    * @param owner The address for which the balance shall be determined
    * 
    * @return The number of licenses owned by `owner`
    */
    function balance(uint256 issuanceNumber, address owner) external constant returns (uint64) {
        var issuance = issuances[issuanceNumber];
        return issuance.balance[owner][owner] + issuance.temporaryBalance[owner];
    }

    /**
     * Determine the number of licenses of a given issuance owned by `owner` 
     * but which may be reclaimed by a different address (i.e. excluding 
     * licenses that are properly owned by `owner`).
     *
     * @param issuanceNumber The issuance for which the balance shall be 
     *                       determined
     * @param owner The address for which the balance shall be determined
     * 
     * @return The number of licenses owned by `owner` but which may be 
     *         reclaimed by someone else
     */
    function temporaryBalance(uint256 issuanceNumber, address owner) external constant returns (uint64) {
        return issuances[issuanceNumber].temporaryBalance[owner];
    }

    /**
     * Determine the number of licenses of a given issuance owned by `owner` 
     * but which may be reclaimed by `reclaimer`.
     *
     * @param issuanceNumber The issuance for which the balance shall be
     *                       determined
     * @param owner The address that owns the licenses but from which the 
     *              licenses may be reclaimed by `reclaimer`
     * @param reclaimer The address that is allowed to reclaim the licenses from
     *                  `owner`
     * 
     * @return The number of licenses owned by `owner` but which may be 
     *         reclaimed by `reclaimer`
     */
    function temporaryBalanceReclaimableBy(uint256 issuanceNumber, address owner, address reclaimer) external constant returns (uint64) {
        return issuances[issuanceNumber].balance[owner][reclaimer];
    }

    /**
     * Transfer `amount` licenses of the given issuance from the sender's 
     * address to `to`. `to` becomes the new proper owner of these licenses.
     *
     * This requires that:
     *  - The sender properly owns at least `amount` licenses of the given 
     *    issuance (transferring temporary balance is not allowed)
     *  - The issuance has not been revoked
     *
     * Upon successful transfer, this fires the `Transfer` event with 
     * `reclaimable` set to `false`.
     *
     * @param issuanceNumber The issuance to which the licenses to be 
     *                       transferred belong
     * @param to The address the licenses shall be transferred to
     * @param amount The number of licenses that shall be transferred
     */
    function transfer(uint256 issuanceNumber, address to, uint64 amount) external {
        relevantIssuances[to].push(issuanceNumber);
        issuances.transferFromMessageSender(issuanceNumber, to, amount);
    }

    /**
     * Temporarily transfer `amount` licenses of the given issuance from the 
     * sender's address to `to`. `to` becomes the temporary owner of the 
     * licenses and the sender is allowed to reclaim the licenses at any point. 
     * `to` is not allowed to transfer these licenses to anyone else.
     *
     * This requires that:
     *  - The sender properly owns at least `amount` licenses of the given 
     *    issuance
     *  - The sender is different from `to`
     *  - The issuance has not been revoked
     *
     * Upon successful transfer, this fires the `Transfer` event with 
     * `reclaimable` set to `true`.
     *
     * @param issuanceNumber The issuance to which the licenses to be 
     *                       transferred belong
     * @param to The address the licenses shall be transferred to
     * @param amount The number of licenses that shall be transferred
     */
    function transferTemporarily(uint256 issuanceNumber, address to, uint64 amount) external {
        relevantIssuances[to].push(issuanceNumber);
        issuances.transferTemporarilyFromMessageSender(issuanceNumber, to, amount);
    }

    /**
     * The sender reclaims `amount` licenses it has previously temporarily 
     * transferred to `from` using `transferTemporarily`, deducting them from 
     * `from`'s temporary balance and adding them to the sender's proper balance 
     * again.
     *
     * This requires that:
     *  - The sender previously temporarily transferred at least `amount` 
     *    licenses to `from` with the right to reclaim them
     *  - The sender is different from `from`
     *  - The issuance has not been revoked
     *
     * Upon successful execution, the `Reclaim` event is fired.
     *
     * @param issuanceNumber The issuance to which the licenses to be reclaimed 
     *                       belong
     * @param from The address from which licenses shall be reclaimed
     * @param amount The number of licenses that shall be reclaimed
     */
    function reclaim(uint256 issuanceNumber, address from, uint64 amount) external {
        issuances.reclaimToSender(issuanceNumber, from, amount);
    }

    /**
     * Revoke the given issuance, disallowing any further license transfers 
     * (including temporary transfers) or reclaims. This action cannot be 
     * undone.
     * This can be performed by the issuer if control has not been taken over 
     * for this license contract and the license contract has not been disabled.
     * If control has been taken over, the manager may revoke licenses even if
     * the license contract has been disabled.
     *
     * @param issuanceNumber The issuance that shall be revoked
     */
    function revoke(uint256 issuanceNumber) external {
        require((msg.sender == issuer && managerAddress == address(0) && !disabled) || msg.sender == managerAddress);
        issuances[issuanceNumber].revoked = true;
        Revoke(issuanceNumber);
    }



    // Management interface

    /**
     * Set the fee required for every license issuance to a new amount. This can 
     * only be done by the LOB root.
     *
     * @param newFee The new issuance fee in Wei
     */
    function setIssuanceFee(uint128 newFee) onlyLOBRoot external {
        issuanceFee = newFee;
        IssuanceFeeChange(newFee);
    }

    /**
    * Withdraw Ether that have been collected as fees from the license contract
    * to the address `recipient`. This can only be initiated by the LOB root.
    *
    * @param amount The amount that shall be withdrawn in Wei
    * @param recipient The address that shall receive the withdrawn Ether
    */
    function withdraw(uint256 amount, address recipient) onlyLOBRoot external {
        recipient.transfer(amount);
    }

    /**
     * Disable the license contract, disallowing any further license issuances 
     * and license revocations by the issuer (a potential manager will still be 
     * able to revoke licenses) while still allowing licenses to be transferred. 
     * This action cannot be undone. It can only be performed by the issuer or 
     * the manager if LOB has taken over control for this license contract.
     */
    function disable() onlyCurrentManager external {
        Disabling();
        disabled = true;
    }

    /**
     * This allows the LOB root to take over management for this license 
     * contractto fix any mistakes or clean the contract up in case the issuer 
     * has lostaccess to his address. It will set the contract into a special 
     * management mode that disallows any management action by the issuer and 
     * grants the management address the right to revoke issuances and disable 
     * the license contract.
     *
     * Setting the manager address back to `0x0` passes control back to the 
     * issuer.
     *
     * This can only be invoked by the LOB root.
     *
     * @param _managerAddress The address that will be allowed to perform 
     *                        management actions on this license contract.
     */
    function takeOverManagementControl(address _managerAddress) onlyLOBRoot external {
        managerAddress = _managerAddress;
        ManagementControlTakeOver(_managerAddress);
    }
}