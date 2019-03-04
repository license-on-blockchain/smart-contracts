const Accounts = {
  getNamed(unnamedAccounts) {
    return {
      lobRootOwner: unnamedAccounts[0],
      lobRoot: unnamedAccounts[1],
      issuer: unnamedAccounts[2],
      firstOwner: unnamedAccounts[3],
      secondOwner: unnamedAccounts[4],
      thirdOwner: unnamedAccounts[5],
      fourthOwner: unnamedAccounts[6],
      manager: unnamedAccounts[7]
    }
  }
}

module.exports = Accounts;
