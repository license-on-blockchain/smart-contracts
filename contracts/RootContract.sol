pragma solidity ^0.5.0;

import "./LicenseContract.sol";

contract RootContract {

    using LicenseContractLib for LicenseContractLib.TransferFeeTier[];

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
     * The factor that is used to get the fee required to be paid for each 
     * license issuing from the corresponding transfer fee for every new license 
     * contract in 0.01%.
     */
    uint32 public defaultIssuanceFeeFactor;

    /**
     * The percentage of the transfer fee that gets credited to the issuer for 
     * every new license contract.
     */
    uint16 public defaultIssuerTransferFeeShare;

    /**
     * The fee in Wei that anyone has to pay to generate a license contract.
     */
    uint128 public registrationFee;

    /**
     * The oracle that is used to query the current conversion rate of Ether to 
     * Euros.
     */
    EtherPriceOracleInterface private etherPriceOracle;


    /**
     * The defaul transfer fee tiers to be set on newly created license 
     * contracts.
     */
    LicenseContractLib.TransferFeeTier[] defaultTransferFeeTiers;

    /** 
     * The addresses of all license contracts created by this root contract.
     */
    LicenseContract[] public licenseContracts;

    /**
     * A version number used to determine the correct ABI for license contracts 
     * created through this root contract.
     *
     * This field will always be available in all future versions of the root 
     * contract.
     */
    uint16 public version = 2;

    /**
     * Emitted when the owner of the root contract changes.
     *
     * @param newOwner The address that now owns the root contract.
     */
    event OwnerChanged(address newOwner);

    /**
     * Fired when a new license contract is created.
     *
     * @param licenseContractAddress The address of the newly created license 
     *                               contract
     */
    event LicenseContractCreation(LicenseContract licenseContractAddress);

    /**
     * Emitted when the fee that is required to be paid for every license 
     * contract creation changes.
     *
     * @param newRegistrationFee The new fee in Wei that is required to be paid
     *                           to generate a new license contract.
     */
    event RegistrationFeeChanged(uint128 newRegistrationFee);

    /**
     * Emitted when the default issuance fee factor changes.
     *
     * @param newDefaultFeeFactor The new default factor that shall be used to 
     *                            compute the issuance fee from the transfer fee 
     *                            in 0.01%
     */
    event DefaultIssuanceFeeFactorChanged(uint32 newDefaultFeeFactor);

    /**
     * Emitted when the default transfer fee tiers are changed.
     *
     * See documentation of `LicenseContract.setTransferFeeTiers` for 
     * documentation of the parameters.
     */
    event DefaultTransferFeeTiersChanged(uint64[] minimumLicenseValues, uint16[] fees);

    /**
     * Emitted when the default transfer fee share of the issuer changes.
     *
     * @param newShare The new percentage of the transfer fees the issuer should 
     *                 receive on new license contracts.
     */
    event DefaultTransferFeeShareChanged(uint16 newShare);

    /**
     * Fired when the root contract gets disabled.
     */
    event Disabling();

    // Constructor

    /**
     * Create a new root contract whose owner is set to the message sender.
     * @param _etherPriceOracle The oracle that is queried to get the current 
     *                          conversion rate of Ether to Euro.
     */
    constructor(EtherPriceOracleInterface _etherPriceOracle) public {
        etherPriceOracle = _etherPriceOracle;
        owner = msg.sender;
    }

    // Creating new license contracts

    /**
     * Initiate the creation of a new license contract tailored to the specified
     * issuer. 
     *
     * Once this call has been executed, the newly created license  contract 
     * needs to be signed before it can issue licenses.
     *
     * This contract is the LOB root of the license contract and the invoker of 
     * this function the license contract's issuer.
     *
     * The SSL certificate needs to be PKCS#12 encoded and encrypted with an 
     * empty password.
     *
     * @param issuerName A human readable name of the person or organisation 
     *                   that will use the license contract to issue LOB 
     *                   licenses
     * @param liability A free text in which the issuer can describe the 
     *                  liability he will assume for all of his issuances
     * @param safekeepingPeriod The number of years all documents related to the 
     *                          audit will be kept by the issuer
     * @param issuerSSLCertificate The SSL certificate that will be used to sign 
     *                             the license contract. See the license 
     *                             contract's documentation on the requirements 
     *                             of this certificate
     */
    function createLicenseContract(string calldata issuerName, string calldata liability, uint8 safekeepingPeriod, bytes calldata issuerSSLCertificate) external payable notDisabled returns (LicenseContract) {
        require(msg.value >= registrationFee);
        LicenseContract licenseContract = new LicenseContract(msg.sender, issuerName, liability, safekeepingPeriod, issuerSSLCertificate, etherPriceOracle);

        licenseContract.setIssuanceFeeFactor(defaultIssuanceFeeFactor);
        licenseContract.setIssuerTransferFeeShare(defaultIssuerTransferFeeShare);

        uint64[] memory minimumLicenseValues = new uint64[](defaultTransferFeeTiers.length);
        uint16[] memory fees = new uint16[](defaultTransferFeeTiers.length);
        for (uint i = 0; i < defaultTransferFeeTiers.length; i++) {
            LicenseContractLib.TransferFeeTier storage tier = defaultTransferFeeTiers[i];
            minimumLicenseValues[i] = tier.minimumLicenseValue;
            fees[i] = tier.fee;
        }
        licenseContract.setTransferFeeTiers(minimumLicenseValues, fees);

        licenseContracts.push(licenseContract);
        emit LicenseContractCreation(licenseContract);
        return licenseContract;
    }

    // Retrieving license contract addresses

    /**
     * Determine the number of license contract addresses stored in the 
     * `liceseContracts` instance variable.
     *
     * @return The number of elements in the `liceseContract` variable
     */
    function licenseContractCount() external view returns (uint256) {
        return licenseContracts.length;
    }
    
    // Managing fees

    /**
     * Withdraw fees that have been collected and transfer them to `recipient`.
     *
     * @param recipient The address to which the withdrawn fees shall be 
     *                  transmitted
     * @param amount The amount of fees that shall be withdrawn in Wei
     */
    function withdraw(address payable recipient, uint amount) onlyOwner external {
        recipient.transfer(amount);
    }

    /**
     * Set the issuance fee factor of a license contract. 
     * 
     * See documentation of `LicenseContract.setIssuanceFeeFactor` for detailed 
     * information.
     *
     * This can only be invoked by the root contract's owner.
     *
     * @param licenseContractAddress The address of the license contract for 
     *                               which the issuance fee shall be changed
     * @param newFeeFactor The new factor that shall be used to compute the 
     *                     issuance fee from the transfer fee in 0.01%
     */
    function setLicenseContractIssuanceFeeFactor(address licenseContractAddress, uint32 newFeeFactor) external onlyOwner {
        LicenseContract(licenseContractAddress).setIssuanceFeeFactor(newFeeFactor);
    }

    /**
     * Set the issuance fee factor for newly created license contracts.
     *
     * See documentation of `LicenseContract.setIssuanceFeeFactor` for detailed 
     * information.
     *
     * This can only be invoked by the root contract's owner.
     *
     * @param newDefaultFeeFactor The new default factor that shall be used to 
     *                            compute the issuance fee from the transfer fee 
     *                            in 0.01%
     */
    function setDefaultIssuanceFeeFactor(uint32 newDefaultFeeFactor) external onlyOwner {
        defaultIssuanceFeeFactor = newDefaultFeeFactor;
        emit DefaultIssuanceFeeFactorChanged(newDefaultFeeFactor);
    }

    /**
     * Set the percentage of the transfer fee that gets credited to the issuer 
     * for every new license contract.
     *
     * This can only be invoked by the root contract's owner.
     *
     * @param newShare The new percentage of the transfer fees the issuer should 
     *                 receive on new license contracts.
     */ 
    function setDefaultIssuerTransferFeeShare(uint16 newShare) external onlyOwner {
        defaultIssuerTransferFeeShare = newShare;
        emit DefaultTransferFeeShareChanged(newShare);
    }

    /**
     * Set the registration fee that is required to be paid when generating a 
     * license contract.
     *
     * This can only be invoked by the root contract's owner.
     * 
     * @param newRegistrationFee The new fee in Wei that is required to be paid
     *                           to generate a new license contract.
     */
    function setRegistrationFee(uint128 newRegistrationFee) external onlyOwner {
        registrationFee = newRegistrationFee;
        emit RegistrationFeeChanged(newRegistrationFee);
    }

    // Transfer fees

    /**
     * Set the default transfer fee tiers for newly created license contracts.
     * See the documentation of LicenseContract.setTransferFeeTiers for 
     * documentation of the parameters.
     */
    function setDefaultTransferFeeTiers(uint64[] calldata minimumLicenseValues, uint16[] calldata fees) external onlyOwner {
        defaultTransferFeeTiers.set(minimumLicenseValues, fees);
        emit DefaultTransferFeeTiersChanged(minimumLicenseValues, fees);
    }

    /**
     * Return the number of transfer fee tiers that will be created for new 
     * license contracts.
     *
     * @return The number of transfer fee tiers for new license contracts
     */
    function getDefaultTransferFeeTiersCount() external view returns (uint) {
        return defaultTransferFeeTiers.length;
    }

    /**
     * Return the `minimumLicenseValue` and `fee` for the transfer fee tier at 
     * the given index.
     *
     * @param index Retrieve the `index`th transfer fee tier. Has to be less 
     *              than `getTransferFeeTiersCount()`.
     * @return The `minimumLicenseValue` and `fee` for the `index`th tier.
     */
    function getDefaultTransferFeeTier(uint index) external view returns (uint64, uint16) {
        LicenseContractLib.TransferFeeTier storage tier = defaultTransferFeeTiers[index];
        return (tier.minimumLicenseValue, tier.fee);
    }

    /**
     * Set the transfer fee tiers on the given license contract. 
     *
     * Can only be invoked by the root contract's owner
     *
     * See documentation of `LicenseContract.setTransferFeeTiers` for 
     * documentation of the parameters.
     */
    function setLicenseContractTransferFeeTiers(LicenseContract licenseContract, uint64[] calldata minimumLicenseValues, uint16[] calldata fees) external onlyOwner {
        licenseContract.setTransferFeeTiers(minimumLicenseValues, fees);
    }

    /**
     * Set the owner of the root contract to a new address.
     * 
     * This can only be invoked by the current owner.
     *
     * @param newOwner The address of the new owner for this root contract
     */
    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    /**
     * Disable this root contract, making it unable to create any more license 
     * contracts. 
     *
     * This action cannot be undone.
     *
     * Upon successful execution, the `Disabling` event is fired.
     *
     * This can only be invoked by the root contract's owner.
     */
    function disable() external onlyOwner {
        disabled = true;
        emit Disabling();
    }

    /**
     * Take over control of a license contract, disallowing any management 
     * actions by the issuer and allowing the manager to revoke issuances and
     * disable the license contract.
     * 
     * Setting the manager address to `0x0` passes control back to the issuer.
     *
     * @param licenseContractAddress The address of the license contract for 
     *                               which control should be taken over
     * @param managerAddress The address that shall manage the license contract
     */
    function takeOverLicenseContractControl(address licenseContractAddress, address managerAddress) external onlyOwner {
        LicenseContract(licenseContractAddress).takeOverManagementControl(managerAddress);
    }

    /**
     * Allow the license contract to transfer Ether to the root contact where
     * they are collected for retrieval by the root contract's owner.
     */
    function() payable external {
    }
}
