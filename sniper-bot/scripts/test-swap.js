const hre = require("hardhat");
const { ethers } = require("ethers");

async function main() {
  const rawContractAddress = "0x7C2B565de1403a3821Ad166fD7D318D6ee0EeBd3".toLowerCase();
  const rawRouterBuy = "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3".toLowerCase();
  const rawRouterSell = "0xD99D1c33F99C3444f8101754aBC46c52416550D1".toLowerCase();
  const rawToken = "0x337610d27c682e347c9cd60bd4b3b107c9d34ddd".toLowerCase();

  const FlashArbitrage = await hre.ethers.getContractAt("FlashArbitrage", rawContractAddress);

  console.log("🚀 Đang gửi lệnh test Flash Swap với cấu hình Gas mới...");
  
  try {
    const tx = await FlashArbitrage.startArbitrage(
      rawRouterBuy,
      rawRouterSell,
      rawToken,
      hre.ethers.utils.parseEther("0.01"), 
      0, 
      0,
      { 
        gasLimit: 1000000,
        // Ép phí gas tối thiểu để mạng Testnet chấp nhận (10 Gwei)
        maxFeePerGas: ethers.utils.parseUnits("10", "gwei"),
        maxPriorityFeePerGas: ethers.utils.parseUnits("10", "gwei")
      }
    );

    console.log("✅ Giao dịch đã được gửi!");
    console.log(`🔗 Link: https://testnet.bscscan.com/tx/${tx.hash}`);
    
    await tx.wait();
    console.log("🏁 Giao dịch thành công trên Block!");
  } catch (error) {
    console.log("❌ Kết quả:");
    if (error.message.includes("insufficient funds")) {
        console.log("Lỗi: Ví của bạn không đủ tBNB để trả phí gas.");
    } else if (error.message.includes("revert")) {
        console.log("Lỗi: Giao dịch bị Revert (Thường là do lộ trình này không có lãi).");
    } else {
        console.log(error.message);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});