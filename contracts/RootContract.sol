pragma solidity ^0.4.15;

import "./LicenseContract.sol";

contract RootContract {

    /**
     * Assert that the message is sent by the root contract's owner 
     */
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    /**
     * Assert that the root contract has not been disabled
     */
    modifier notDisabled() {
        require(!disabled);
        _;
    }

    /**
     * The address that owns this root contract and can access the management 
     * interface
     */
    address public owner;

    /**
     * Whether or not this contract is disabled and can thus no longer create 
     * new license contracts.
     *
     * The `Disabled` event is emitted when this variable is set to `true`.
     */
    bool public disabled;

    /**
     * The fee that will be set on each newly created license contract and which
     * will need to be paid for every issuance on the license contract.
     */
    uint128 public defaultFee;

    /** 
     * The addresses of all license contracts created by this root contract.
     */
    address[] public licenseContracts;

    /**
     * Fired every time a new license contract is created.
     *
     * @param licenseContractAddress The address of the newly created license 
     *                               contract
     */
    event LicenseContractCreation(address licenseContractAddress);

    /**
     * Fired when the root contract gets disabled.
     */
    event Disabled();

    // Constructor

    function RootContract() {
        owner = msg.sender;
    }

    // Creating new license contracts

    /**
     * Initiate the creation of a new license contract tailored to the specified
     * issuer. Once this call has be executed, the newly created license 
     * contract needs to be signed before it can issue licenses.
     *
     * This contract is by default the LOB root of the license contract and the 
     * invoker of this function the license contract's issuer.
     *
     * @param issuerName A human readable name of the person or organisation 
     *                   that will use the license contract to issue LOB 
     *                   licenses
     * @param liability The liability that shall be substitute into the 
     *                  liability placeholder of the certificate text
     * @param safekeepingPeriod The amount of years all documents having to do 
     *                          with the audit will be kept by the issuer
     * @param issuerCertificate The SSL certificate that will be used to sign 
     *                          the license contract. See the license contract's
     *                          documentation on the requirements of this 
     *                          certificate
     */
    // TODO: In which format shall the certificate be?
    function createLicenseContract(string issuerName, string liability, uint8 safekeepingPeriod, bytes issuerCertificate) external notDisabled returns (address) {
        var licenseContractAddress = new LicenseContract(msg.sender, issuerName, liability, issuerCertificate, safekeepingPeriod, defaultFee);
        licenseContracts.push(licenseContractAddress);
        LicenseContractCreation(licenseContractAddress);
        return licenseContractAddress;
    }

    // Retrieving license contract addresses

    /**
     * Retrieve the number of license contract addresses stored in the 
     * `liceseContracts` instance variable.
     *
     * @return The number of elements in the `liceseContract` variable
     */
    function licenseContractCount() external constant returns (uint256) {
        return licenseContracts.length;
    }

    // Constructing the certificate text
    
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
        ) public pure returns (string) {
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

    // Managing fees

    /**
     * Set the fee of a license contract. See documentation of 
     * `LicenseContract.setFee` for detailed information.
     *
     * This can only be invoked by the root contract's owner.
     *
     * @param licenseContractAddress The address of the license contract for 
     *                               which the fee shall be changed
     * @param newFee The new fee that shall be required for every issuance of 
     *               this license contract
     */
    function setLicenseContractFee(address licenseContractAddress, uint128 newFee) external onlyOwner {
        LicenseContract(licenseContractAddress).setFee(newFee);
    }

    /**
     * Set the fee that is set on every newly created license contract and which 
     * is thus required for every issuance made by that license contract.
     *
     * This can only be invoked by the root contract's owner.
     *
     * @param newDefaultFee The new default fee that shall be set on every newly 
     *                      created license contract
     */
    function setDefaultFee(uint128 newDefaultFee) external onlyOwner {
        defaultFee = newDefaultFee;
    }

    // Managing license contracts

    /**
     * Withdraw fees collected by a license contract from the license contract 
     * and transfer them to the given recpient address.
     *
     * This can only be invoked by the root contract's owner.
     *
     * @param licenseContractAddress The address of the license contract from 
     *                               which collected fees shall be withdrawn
     * @param amount The amount of wei that shall be withdrawn from the license 
     *               contract
     * @param recipient The address to which the withdrawn wei should be sent
     */
    function withdrawFromLicenseContract(address licenseContractAddress, uint256 amount, address recipient) external onlyOwner {
        LicenseContract(licenseContractAddress).withdraw(amount, recipient);
    }

    /**
     * Disable the license contract with the given address, making it unable to 
     * issue any more licenses.
     *
     * This can only be invoked by the root contract's owner.
     *
     * @param licenseContractAddress The address of the license contract that 
     *                               shall be disabled
     */
    function disableLicenseContract(address licenseContractAddress) external onlyOwner {
        LicenseContract(licenseContractAddress).disable();
    }

    // Managing root contract

    /**
     * Set the owner of the root contract to a new address.
     * 
     * This can only be invoked by the current owner.
     *
     * @param newOwner The address of the new owner for this root contract
     */
    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    /**
     * Disable this root contract, making it unable to create any more license 
     * contracts. 
     *
     * This action cannot be undone.
     *
     * Upon successful execution, the `Disabled` event is fired.
     *
     * This can only be invoked by the root contract's owner.
     */
    function disable() external onlyOwner {
        disabled = true;
        Disabled();
    }
}