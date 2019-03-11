const Accounts = {
  getNamed(unnamedAccounts) {
    return {
      // Don't use unnamedAccounts[0] as it's the default for transactions
      lobRootOwner: unnamedAccounts[1],
      lobRoot: unnamedAccounts[2],
      issuer: unnamedAccounts[3],
      firstOwner: unnamedAccounts[4],
      secondOwner: unnamedAccounts[5],
      thirdOwner: unnamedAccounts[6],
      fourthOwner: unnamedAccounts[7],
      manager: unnamedAccounts[8]
    }
  }
}

module.exports = Accounts;
