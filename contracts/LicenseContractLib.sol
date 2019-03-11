pragma solidity ^0.5.0;

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
         * The value of each individual license according to the manufacturer's 
         * price list at the time it was origiginally purchased from the 
         * manufacturer in Euro-Cents.
         */
        uint64 originalValue;

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
         * more license transfers, temporary transfers or revokes.
         */
        bool revoked;

        /**
         * If the license has been revoked, a free text filled by the issuer
         * explaining why he as revoked the issuance.
         */
        string revocationReason;

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
         * `sum_{x, y} (balance[x][y]) == originalSupply`
         */
        mapping (address => mapping(address => uint64)) balance;

        /**
         * A cached value to speed up the calculation of the total number of 
         * licenses currently owned by an address.
         *
         * `temporaryBalance[x] = sum_{y, y != x} (balance[x][y])`, i.e.
         * `temporaryBalance` keeps track of the number of licenses temporarily
         * owned by `x`.
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
         * licenses may be reclaimed. Whenever `x` has transferred a license
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
    event Transfer(uint256 indexed issuanceNumber, address indexed from, address indexed to, uint64 amount, bool temporary);
    event Reclaim(uint256 indexed issuanceNumber, address indexed from, address indexed to, uint64 amount);

    /**
     * Insert a new issuance with the given parameters into the array. Due to 
     * technical limitations, this does not set original supply nor initalises
     * the balances mapping.
     */
    function insert(Issuance[] storage issuances, string memory description, string memory code, uint64 originalSupply, uint64 originalValue, uint32 auditTime, string memory auditRemark) public returns (uint256) {
        return issuances.push(Issuance(description, code, originalSupply, originalValue, auditTime, auditRemark, /*revoked*/false, /*revocationReason*/"")) - 1;
    }

    /**
     * Assign the `originalSupply` member of the issuance with the given 
     * issuance number and assign `initialOwnerAddress` all initial licenses. 
     * This also emits all corresponding events.
     */
    function createInitialLicenses(Issuance[] storage issuances, uint256 issuanceNumber, uint64 originalSupply, address initialOwnerAddress) public returns (uint256) {
        issuances[issuanceNumber].balance[initialOwnerAddress][initialOwnerAddress] = originalSupply;
        emit Issuing(issuanceNumber);
        emit Transfer(issuanceNumber, address(0x0), initialOwnerAddress, originalSupply, /*temporary*/false);
        return issuanceNumber;
    }

    function transferFromMessageSender(Issuance[] storage issuances, uint256 issuanceNumber, address to, uint64 amount) internal {
        Issuance storage issuance = issuances[issuanceNumber];
        require(!issuance.revoked);
        require(issuance.balance[msg.sender][msg.sender] >= amount);

        issuance.balance[msg.sender][msg.sender] -= amount;
        issuance.balance[to][to] += amount;

        emit Transfer(issuanceNumber, /*from*/msg.sender, to, amount, /*temporary*/false);
    }

    function transferTemporarilyFromMessageSender(Issuance[] storage issuances, uint256 issuanceNumber, address to, uint64 amount) internal {
        Issuance storage issuance = issuances[issuanceNumber];
        require(!issuance.revoked);
        require(issuance.balance[msg.sender][msg.sender] >= amount);
        require(to != msg.sender);

        issuance.balance[msg.sender][msg.sender] -= amount;
        issuance.balance[to][msg.sender] += amount;
        issuance.temporaryBalance[to] += amount;
        issuance.temporaryLicenseHolders[msg.sender].push(to);

        emit Transfer(issuanceNumber, /*from*/msg.sender, to, amount, /*temporary*/true);
    }

    function reclaimToSender(Issuance[] storage issuances, uint256 issuanceNumber, address from, uint64 amount) public {
        Issuance storage issuance = issuances[issuanceNumber];
        require(!issuance.revoked);
        require(issuance.balance[from][msg.sender] >= amount);
        require(from != msg.sender);
        
        issuance.balance[from][msg.sender] -= amount;
        issuance.balance[msg.sender][msg.sender] += amount;
        issuance.temporaryBalance[from] -= amount;

        emit Reclaim(issuanceNumber, from, /*to*/msg.sender, amount);
    }

    function buildCertificateText(string storage issuerName, address licenseContract, uint8 safekeepingPeriod, string storage liability) public pure returns (string memory) {
        string memory s = StringUtils.concat(
            "Wir, ",
            issuerName,
            ", erklären hiermit,\n\ndass wir unter dem Ethereum Smart Contract mit der Ethereum-Adresse „",
            StringUtils.addressToString(address(licenseContract)),
            "“ (nachfolgend „LOB-License-Contract“ genannt) Software-Lizenzbescheinigungen gemäß dem Verfahren der License-On-Blockchain Foundation („LOB-Verfahren“) in Version 1 ausstellen.\nEine detaillierte Spezifikation des Verfahrens kann unter der URL https://github.com/license-on-blockchain/whitepaper/releases/download/version-1/Whitepaper.pdf abgerufen werden. Das Dokument hat den SHA-256 Hashwert f027e9ceba595597e02e48aa5fa129a5c7b9f7b1c2f961dc0112f78440c94763.\n\nGemäß diesem LOB-Verfahren unterwerfen wir uns insbesondere folgenden Obliegenheiten:\n1. Wir werden Software-Lizenzbescheinigungen nur ausstellen, wenn unser Prüfung ergeben hat, dass \n  a) die Lizenzen ursprünglich zur dauerhaften Nutzung im Bereich der EU verkauft wurden \n  b) die Lizenzen zum Zeitpunkt des Verkaufs an den Lizenzinhaber nicht mehr verwendet wurden oder anderweitig installiert bzw. im Einsatz waren\n  c) über diese Lizenzen nicht zwischenzeitlich anderweitig verfügt und\n  d) keine weitere Lizenzbestätigung bei einem anderen Auditor – nach welchem Verfahren auch immer – angefordert wurde.\n2. Wir werden uns von den Empfängern unserer Lizenzbescheinigungen schriftlich und nachweisbar wortwörtlich zusichern lassen: „Ich werde eine Weitergabe der hiermit bescheinigten Lizenz(en) auf dem License Contract durch dafür vorgesehenen Funktionen dokumentieren. Soll die Übertragung außerhalb des LOB-Verfahrens erfolgen, werde ich zuvor die Bescheinigung der Lizenz durch Übertragung der Lizenz an die Pseudo-Adresse ‚0x0000000000000000000000000000000000000000‘ terminieren. Dem Folgeerwerber werde ich eine gleichlautende Obliegenheit unter Verwendung des Wortlauts dieses Absatzes auferlegen.“\n3. Wir halten unsere Lizenzbescheinigung auch gegenüber jedem aufrecht, dem eine oder mehrere mit dieser Lizenzbescheinigung bestätigte Lizenzen übertragen werden, sofern\n  a) diese Übertragung innerhalb dieses LOB-License-Contracts mithilfe der Funktion „transfer“ oder „transferTemporarily“ dokumentiert wurde und\n  b) der Empfänger der Transaktion sich ebenfalls der o.g. Obliegenheit zur Dokumentation weiterer Veräußerungen auf der Blockchain unterworfen hat.\n\nUns vorgelegte Belege und Kaufnachweise zu den von uns bescheinigten Lizenzen werden bei uns für die Dauer von ");
        s = StringUtils.concat(
            s,
            StringUtils.uintToString(safekeepingPeriod),
            " Jahren archiviert.\n\n",
            liability);
        return s;
    }
}
