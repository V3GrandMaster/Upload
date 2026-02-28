// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;



interface IUniswapV2Pair {

    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external;

    function token0() external view returns (address);

    function token1() external view returns (address);

    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);

}



interface IUniswapV2Router {

    function swapExactTokensForTokens(

        uint amountIn,

        uint amountOutMin,

        address[] calldata path,

        address to,

        uint deadline

    ) external returns (uint[] memory amounts);

    function factory() external view returns (address);

}



interface IUniswapV2Factory {

    function getPair(address tokenA, address tokenB) external view returns (address pair);

}



interface IERC20 {

    function transfer(address recipient, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);

}



contract FlashArbitrage {

    address public owner;

    mapping(address => bool) public isAuthorized;



    modifier onlyOwner() {

        require(msg.sender == owner, "Not owner");

        _;

    }



    modifier onlyAuthorized() {

        require(isAuthorized[msg.sender] || msg.sender == owner, "Not authorized");

        _;

    }



    constructor() {

        owner = msg.sender;

        isAuthorized[msg.sender] = true;

    }



    function authorize(address _addr) external onlyOwner {

        isAuthorized[_addr] = true;

    }



    function startArbitrage(

        address _routerBuy,

        address _routerSell,

        address _token,

        uint _amountIn,

        uint _amountOutMin,

        uint _profitMin

    ) external onlyAuthorized returns (bool) {

        address wNative = getWNative();

        address pair = getPair(_routerBuy, wNative, _token);

        require(pair != address(0), "Pair not found");



        (address token0, ) = (IUniswapV2Pair(pair).token0(), IUniswapV2Pair(pair).token1());

        bool isNativeToken0 = (token0 == wNative);

        

        uint amount0Out = isNativeToken0 ? _amountIn : 0;

        uint amount1Out = isNativeToken0 ? 0 : _amountIn;



        bytes memory data = abi.encode(msg.sender, _routerBuy, _routerSell, _token, _amountIn, _amountOutMin, _profitMin);

        IUniswapV2Pair(pair).swap(amount0Out, amount1Out, address(this), data);

        return true;

    }



    function uniswapV2Call(address _sender, uint _amount0, uint _amount1, bytes calldata _data) external {

        // Giải mã dữ liệu và khai báo các biến cơ bản trước

        (address caller, address routerBuy, address routerSell, address token, uint amountIn, uint amountOutMin, uint profitMin) = 

            abi.decode(_data, (address, address, address, address, uint, uint, uint));

        

        require(_sender == address(this), "not from this contract");

        

        uint nativeReceived;

        uint repayAmount;

        address wNative = getWNative();



        // Sử dụng BLOCK SCOPE {} để giải quyết lỗi STACK TOO DEEP

        {

            uint nativeBorrowed = _amount0 > 0 ? _amount0 : _amount1;

            

            // Bước 1: Mua token trên RouterBuy

            address[] memory pathBuy = new address[](2);

            pathBuy[0] = wNative;

            pathBuy[1] = token;

            

            IERC20(wNative).approve(routerBuy, nativeBorrowed);

            uint[] memory amountsBuy = IUniswapV2Router(routerBuy).swapExactTokensForTokens(

                nativeBorrowed,

                amountOutMin,

                pathBuy,

                address(this),

                block.timestamp + 300

            );

            

            // Bước 2: Bán token trên RouterSell

            uint tokensReceived = amountsBuy[1];

            address[] memory pathSell = new address[](2);

            pathSell[0] = token;

            pathSell[1] = wNative;

            

            IERC20(token).approve(routerSell, tokensReceived);

            uint[] memory amountsSell = IUniswapV2Router(routerSell).swapExactTokensForTokens(

                tokensReceived,

                0, 

                pathSell,

                address(this),

                block.timestamp + 300

            );

            

            nativeReceived = amountsSell[1];

            

            // Tính toán số tiền phải trả (Gốc + 0.3% phí)

            uint fee = (nativeBorrowed * 3 / 997) + 1; // Công thức chuẩn của Uniswap V2

            repayAmount = nativeBorrowed + fee;

        }



        // Kiểm tra lợi nhuận sau khi thoát khỏi scope (Stack đã trống bớt)

        require(nativeReceived >= repayAmount + profitMin, "Profit too low");

        

        // Trả nợ cho Pool (msg.sender lúc này là địa chỉ Pool)

        IERC20(wNative).transfer(msg.sender, repayAmount);

        

        // Chuyển lợi nhuận còn lại cho người gọi (caller)

        uint profit = nativeReceived - repayAmount;

        IERC20(wNative).transfer(caller, profit);

    }



    function getWNative() public pure returns (address) {

        // Đã sửa thành WBNB trên BSC Testnet

        return 0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd; 

    }



    function getPair(address router, address tokenA, address tokenB) public view returns (address) {

        address factory = IUniswapV2Router(router).factory();

        return IUniswapV2Factory(factory).getPair(tokenA, tokenB);

    }



    // Hàm rút tiền khẩn cấp

    function withdraw(address _token) external onlyOwner {

        uint bal = IERC20(_token).balanceOf(address(this));

        IERC20(_token).transfer(owner, bal);

    }

// Thêm 2 dòng này vào cuối hợp đồng, trước dấu đóng ngoặc nhọn "}" cuối cùng

    receive() external payable {}

    fallback() external payable {}

}