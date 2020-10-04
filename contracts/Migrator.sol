pragma solidity 0.6.12;

import "./uniswapv2/interfaces/IUniswapV2Pair.sol";
import "./uniswapv2/interfaces/IUniswapV2Factory.sol";


contract Migrator {
    address public chef;
    address public oldFactoryUni;
    address public oldFactorySushi;
    IUniswapV2Factory public factory;
    uint256 public notBeforeBlock;
    uint256 public desiredLiquidity = uint256(-1);

    enum Platform{
        uniswap,
        sushiswap
    }

    constructor(
        address _chef,
        address _oldFactoryUni,
        address _oldFactorySushi,
        IUniswapV2Factory _factory,
        uint256 _notBeforeBlock
    ) public {
        chef = _chef;
        oldFactoryUni = _oldFactoryUni;
        oldFactorySushi = _oldFactorySushi;
        factory = _factory;
        notBeforeBlock = _notBeforeBlock;
    }

    function migrate(IUniswapV2Pair orig, Platform platform) public returns (IUniswapV2Pair) {
        require(msg.sender == chef, "not from master chef");
        require(block.number >= notBeforeBlock, "too early to migrate");
        if(platform == Platform.uniswap){
            require(orig.factory() == oldFactoryUni, "not from old factory");
        }else if(platform == Platform.sushiswap){
            require(orig.factory() == oldFactorySushi, "not from old factory");
        }else{
            revert();
        }
        address token0 = orig.token0();
        address token1 = orig.token1();
        IUniswapV2Pair pair = IUniswapV2Pair(factory.getPair(token0, token1));
        if (pair == IUniswapV2Pair(address(0))) {
            pair = IUniswapV2Pair(factory.createPair(token0, token1));
        }
        uint256 lp = orig.balanceOf(msg.sender);
        if (lp == 0) return pair;
        desiredLiquidity = lp;
        orig.transferFrom(msg.sender, address(orig), lp);
        orig.burn(address(pair));
        pair.mint(msg.sender);
        desiredLiquidity = uint256(-1);
        return pair;
    }

}
