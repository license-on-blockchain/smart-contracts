pragma solidity ^0.4.16;

contract LOBTokenContract {

    /// License description

    /** 
     * An unambiguous description of the license this token manages. 
     * 
     * This could be the SKU of the product used by the software manufacturer 
     * together with the manufacturer's name or a free text description.
     */
    string public name;
    
    /** 
     * The total number of licenses managed by this token. This will only be 
     * assigned on contract creation and may decrease when the `destroy` 
     * function gets called, but will never increase.
     */
    uint256 public totalSupply;

    string public constant symbol = "LOB";


    /// Creation addresses

    /** 
     * The address that initiated the creation of this token contract. 
     * 
     * In the normal LOB workflow this is the address that invoked `create` on 
     * the root contract.
     */
    address public issuer;

    /**
     * A human readable name of the instance that created this token contract
     * and thus issued the licenses. Should match the name in the certificate.
     * If it does not match, this is a serious violation of the issuer's 
     * trustworthiness.
     */
    string public issuerName;

    /**
     * The address that created this token contract.
     *
     * In the normal LOB workflow, this is the address of the LOB root contract.
     */
    address internal creator;



    /// State management

    /** 
     * The number of licenses currently owned by an address. The sum of these 
     * is equal to `totalSupply`.
     */
    mapping (address => uint256) internal balance;
    
    /**
     * Keeps track of withdrawal allowances. 
     * 
     * `allowed[from][to] == value` means that `from` has authorised `to` to 
     * withdraw `value` licenses from his account with as many transactions as 
     * `to` wishes.
     */
    mapping (address => mapping (address => uint256)) internal allowed;

    /**
     * Whether or not the contract has been revoked by the root certificate 
     * (potentially on the issuer's order) and should thus be considered as not
     * certifying license ownership anymore.
     *
     * This is `false` initially and may only be set to `true` once. Once set to
     * `true`, it cannot be changed back to `false`.
     */
    bool internal revoked;



    /// Events

    /** 
     * Fired on each license transfer. 
     *
     * Transfers from `0x0` represent the creation of licenses, which only 
     * happens when the contract is created.
     * 
     * Transfers to `0x0` represent that a license got destroyed.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * Fired every time a user creates a withdrawal approval via the `approve` 
     * function.
     */
    event Approval(address indexed _owner, address indexed _spender, uint256 _value);

    /**
     * Fired when the token contract gets revoked using the `revoke` function.
     */
    event Revoke();



    /// Constructor

    /**
     * @param _licenseName A name that unambiguously describes the type of 
     *                     license managed by this contract
     * @param _numLicenses The number of licenses managed by this contract
     * @param _issuer The address that initiated the creation of this token 
     *                contract (in the normal LOB workflow, the address that 
     *                invoked `create` on the root contract)
     * @param _issuerName A human readable name of the license issuer. Should 
     *                    match the name in the SSL certificate.
     * @param _initialOwner The address that shall initially own the licenses
     *                      managed by this contract
     */
    function LOBTokenContract(string _licenseName, uint256 _numLicenses, address _issuer, string _issuerName, address _initialOwner) public {
        name = _licenseName;

        totalSupply = _numLicenses;
        balance[_initialOwner] = _numLicenses;
        Transfer(0x0, _initialOwner, _numLicenses);
        
        issuer = _issuer;
        issuerName = _issuerName;
        creator = msg.sender;
    }



    /// License transfer

    /**
     * Transfers `_value` licenses from the sender address to `_to`.
     *
     * Fires the `Transfer` event with the corresponding values.
     * 
     * @param _to The destination address of the transfer
     * @param _value The number of licenses to transfer
     *
     * @return Whether or not the license transfer was successful
     * 
     * Throws if any of the following is true:
     *         - The sender address does not own `_value` licenses
     *         - The token contract has been revoked
     */
    function transfer(address _to, uint256 _value) external returns (bool success) {
        require(balance[msg.sender] >= _value);
        require(!revoked);
        
        balance[msg.sender] -= _value;
        balance[_to] += _value;
        
        Transfer(msg.sender, _to, _value);

        return true;
    }

    /**
     * If `_from` has allowed the sender to withdraw at least `_value` from his 
     * account via the `approve` function, transfers `_value` licenses from 
     * `_from` to `_to`.
     *
     * Fires the `Transfer` event with the corresponding parameters.
     *
     * @param _from The account from which the licenses shall be deducted
     * @param _to The new owner of the transferred licenses
     * @param _value The number of licenses to transfer
     *
     * @return Whether or not the license transfer was successful
     *
     * Throws if any of the following is true:
     *         - `_from` does not own `_value` licenses
     *         - The sender is not allowed to withdraw `_value` licenses from 
     *           `_from`
     *         - The token contract has been revoked
     */
    function transferFrom(address _from, address _to, uint256 _value) external returns (bool success) {
        // Check if `_value` has sufficient funds
        require(balance[_from] >= _value);
        // Check if the message sender is allowed to withdraw `_value` license
        require(allowed[_from][msg.sender] >= _value);
        // Don't allow transfers if the token contract has been revoked
        require(!revoked);

        // Perform the transfer
        balance[_to] += _value;
        balance[_from] -= _value;
        Transfer(_from, _to, _value);

        // Deduct from the amount msg.sender is still allowed to withdraw
        allowed[_from][msg.sender] -= _value;

        return true;
    }
    
    /**
     * Approve `_spender` to withdraw `_value` licenses from the sender's 
     * account using the `transferFrom` function.
     *
     * @param _spender The account that shall be allowed to withdraw licenses
     *                 from the sender's account
     * @param _value The number of licenses `_spender` shall be allowed to 
     *               withdraw
     *
     * @return Whether or not the approval has successfully been set
     *
     * Throws if the token contract has been revoked
     */
    function approve(address _spender, uint256 _value) external returns (bool success) {
        require(!revoked);

        allowed[msg.sender][_spender] = _value;
        Approval(msg.sender, _spender, _value);

        return true;
    }

    /**
     * Destroys `_value` licenses which must be currently owned by the sender.
     * Adjusts `totalSupply` to match the new total supply of licenses.
     *
     * @param _value The number of licenses to be destroyed
     * 
     * @return Whether or not the destruction was successful
     *
     * Throws if any of the following is true:
     *         - The sender does not own `_value` licenses
     *         - The token contract has been revoked
     */
    function destroy(uint256 _value) external returns (bool success) {
        require(balance[msg.sender] >= _value);
        require(!revoked);

        balance[msg.sender] -= _value;
        Transfer(msg.sender, 0x0, _value);
        totalSupply -= _value;
        
        return true;
    }



    /// Balance enquiry

    /**
     * Determines the number of licenses (managed by this contract) that are 
     * owned by `_owner`.
     * 
     * @param _owner The address for which license ownership shall be determined
     *
     * @return The number of licenses owned by `_owner`
     */
    function balanceOf(address _owner) constant external returns (uint numLicenses) {
        return balance[_owner];
    }

    /**
     * Returns the number of licenses `_spender` is still allowed to withdraw 
     * from `_owner`.
     *
     * @param _owner The account that licenses shall be withdrawn from
     * @param _spender The address that wants to withdraw licenses from `_owner`
     *
     * @return The number of licenses `_spender` is allowed to withdraw from 
     *          `_owner`
     */
    function allowance(address _owner, address _spender) constant external returns (uint256 remaining) {
        return allowed[_owner][_spender];
    }



    /// Revoking

    /**
     * Revoke the licenses certified by this token contract, rendering all 
     * license ownerships as void and disallowing any further license transfers.
     * May only be called by the address that created this smart contract (i.e.
     * the root contract in case of the normal LOB workflow).
     *
     * This action cannot be undone. That is `revoked` cannot be set to `false`
     * again after this function has been called.
     * 
     * Fires the `Revoke` event.
     *
     * Throws if any of the following is true:
     *         - Called by a different address than the one that created this 
     *           contract
     *         - The token contract has already been revoked
     */
    function revoke() external {
        require(msg.sender == creator);
        require(!revoked);

        revoked = true;
        Revoke();
    }

    /**
     * Returns whether or not the token contract has been revoked. If this 
     * function returns `true`, any licenses certified by this contract shall
     * be considered void and not be counted towards the total number of 
     * licenses owned by an address.
     */
    function isRevoked() constant external returns (bool isRevoked) {
        return revoked;
    }



    /// Certificate management

    // /**
    //  * Returns the text of the license certificate, substituting all parameters 
    //  * into the standard format that is included in the root smart contract.
    //  */
    // function certificate() external constant returns (string certificate) {
    //     // TODO: Not yet implemented
    //     require(false);
    // }

    // function issuerCertificate() external constant returns (bytes issuerCertificate) {
    //     // TODO: Not yet implemented
    //     require(false);
    // }

    // function certificateSignature() external constant returns (bytes certificateSignature) {
    //     // TODO: Not yet implemented
    //     require(false);
    // }
}
