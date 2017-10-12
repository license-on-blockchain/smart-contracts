var TokenContract = artifacts.require("./LOBTokenContract.sol");

module.exports = function(deployer, network, accounts) {
  accounts = require("../accounts.js")(accounts);
  deployer.deploy(TokenContract, "Microsoft Office 2013", 70, accounts.firstIssuer, "Soft&Cloud", accounts.firstOwner);
};
