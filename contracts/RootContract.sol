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
     * The issuance fee that will be set on each newly created license contract 
     * and which will need to be paid for every issuance on the license 
     * contract. In Wei.
     */
    uint128 public defaultIssuanceFee;

    /** 
     * The addresses of all license contracts created by this root contract.
     */
    address[] public licenseContracts;

    uint16 public version = 5;

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
    event Disabling();

    // Constructor

    /**
     * Creates a new root contract whose owner is set to the message sender.
     */
    function RootContract() public {
        owner = msg.sender;
    }

    // Creating new license contracts

    /**
     * Initiate the creation of a new license contract tailored to the specified
     * issuer. Once this call has be executed, the newly created license 
     * contract needs to be signed before it can issue licenses.
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
     *                  liability he will take for all of his issuances
     * @param safekeepingPeriod The amount of years all documents having to do 
     *                          with the audit will be kept by the issuer
     * @param issuerSSLCertificate The SSL certificate that will be used to sign 
     *                             the license contract. See the license 
     *                             contract's documentation on the requirements 
     *                             of this certificate
     */
    function createLicenseContract(string issuerName, string liability, uint8 safekeepingPeriod, bytes issuerSSLCertificate) external notDisabled returns (address) {
        var licenseContractAddress = new LicenseContract(msg.sender, issuerName, liability, safekeepingPeriod, issuerSSLCertificate, defaultIssuanceFee);
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
    
    // Managing fees

    /**
     * Set the issuance fee of a license contract. See documentation of 
     * `LicenseContract.setIssuanceFee` for detailed information.
     *
     * This can only be invoked by the root contract's owner.
     *
     * @param licenseContractAddress The address of the license contract for 
     *                               which the issuance fee shall be changed
     * @param newFee The new fee that shall be required for every license 
     *               issuance done through this license contract
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
     *               contract. Needs to be lower than the amount of fees 
     *               collected by the license contract
     * @param recipient The address to which the withdrawn Wei should be sent
     */
    function withdrawFromLicenseContract(address licenseContractAddress, uint256 amount, address recipient) external onlyOwner {
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
        Disabling();
    }

    function takeOverLicenseContractControl(address licenseContractAddress, address managerAddress) external onlyOwner {
        LicenseContract(licenseContractAddress).takeOverManagementControl(managerAddress);
    }
}