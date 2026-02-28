const hre = require("hardhat");

async function main() {
  const FlashArbitrage = await hre.ethers.getContractFactory("FlashArbitrage");
  const flash = await FlashArbitrage.deploy();
  await flash.deployed();
  console.log("FlashArbitrage deployed to:", flash.address);
}

main().then(() => process.exit(0)).catch(error => {
  console.error(error);
  process.exit(1);
});