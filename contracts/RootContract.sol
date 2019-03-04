pragma solidity ^0.5.0;

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
     * The issuance fee in Wei that will be set on each newly created license 
     * contract and which will need to be paid for every issuance on the license 
     * contract.
     */
    uint128 public defaultIssuanceFee;

    /**
     * The fee in Wei that anyone has to pay to generate a license contract.
     */
    uint128 public registrationFee;

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
     * Fired when a new license contract is created.
     *
     * @param licenseContractAddress The address of the newly created license 
     *                               contract
     */
    event LicenseContractCreation(LicenseContract licenseContractAddress);

    /**
     * Fired when the root contract gets disabled.
     */
    event Disabling();

    // Constructor

    /**
     * Create a new root contract whose owner is set to the message sender.
     */
    constructor() public {
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
        LicenseContract licenseContractAddress = new LicenseContract(msg.sender, issuerName, liability, safekeepingPeriod, issuerSSLCertificate, defaultIssuanceFee);
        licenseContracts.push(licenseContractAddress);
        emit LicenseContractCreation(licenseContractAddress);
        return licenseContractAddress;
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
     * Set the issuance fee of a license contract. 
     * 
     * See documentation of `LicenseContract.setIssuanceFee` for detailed 
     * information.
     *
     * This can only be invoked by the root contract's owner.
     *
     * @param licenseContractAddress The address of the license contract for 
     *                               which the issuance fee shall be changed
     * @param newFee The new fee that shall be required for every license 
     *               issuing done through this license contract
     */
    function setLicenseContractIssuanceFee(address licenseContractAddress, uint128 newFee) external onlyOwner {
        LicenseContract(licenseContractAddress).setIssuanceFee(newFee);
    }

    /**
     * Set the issuance fee that is set on every newly created license contract 
     * and which is thus required for every issuance made by that license 
     * contract.
     *
     * This can only be invoked by the root contract's owner.
     *
     * @param newDefaultFee The new default issuance fee that shall be set on 
     *                      every newly created license contract
     */
    function setDefaultIssuanceFee(uint128 newDefaultFee) external onlyOwner {
        defaultIssuanceFee = newDefaultFee;
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
    }

    // Managing license contracts

    /**
     * Withdraw fees collected by a license contract from the license contract 
     * and transfer them to `recipient`.
     *
     * This can only be invoked by the root contract's owner.
     *
     * @param licenseContractAddress The address of the license contract from 
     *                               which collected fees shall be withdrawn
     * @param amount The amount of Wei that shall be withdrawn from the license 
     *               contract. Needs to be less than the fees collected by the 
     *               license contract
     * @param recipient The address to which the withdrawn Wei should be sent
     */
    function withdrawFromLicenseContract(address licenseContractAddress, uint256 amount, address payable recipient) external onlyOwner {
        LicenseContract(licenseContractAddress).withdraw(amount, recipient);
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
}
