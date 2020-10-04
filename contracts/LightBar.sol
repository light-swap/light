pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";


contract LightBar is ERC20("LightBar", "xLIGHT"){
    using SafeMath for uint256;
    IERC20 public light;

    constructor(IERC20 _light) public {
        light = _light;
    }

    // Enter the bar. Pay some LIGHTs. Earn some shares.
    function enter(uint256 _amount) public {
        uint256 totalLight = light.balanceOf(address(this));
        uint256 totalShares = totalSupply();
        if (totalShares == 0 || totalLight == 0) {
            _mint(msg.sender, _amount);
        } else {
            uint256 what = _amount.mul(totalShares).div(totalLight);
            _mint(msg.sender, what);
        }
        light.transferFrom(msg.sender, address(this), _amount);
    }

    // Leave the bar. Claim back your LIGHTs.
    function leave(uint256 _share) public {
        uint256 totalShares = totalSupply();
        uint256 what = _share.mul(light.balanceOf(address(this))).div(totalShares);
        _burn(msg.sender, _share);
        light.transfer(msg.sender, what);
    }
}
