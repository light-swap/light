pragma solidity 0.6.12;

interface ILightToken {
    function approve(address spender, uint value) external returns (bool);
}

interface ILightMain {
    function shareLightForCreators(uint256 _pid, uint256 _amount) external;
}

contract BuyBack {
    ILightMain public lightMain;
    ILightToken public lightToken;

    constructor(
        ILightMain _lightMain,
        ILightToken _lightToken
    ) public {
        lightMain = _lightMain;
        lightToken = _lightToken;
    }

    // TODO: Buy back light. For test
    function buyBackLightForCreators(uint256 _pid) payable public returns (bool) {
        require(msg.value > 0, "buyBackLightForCreators: bad value");
        // lightToken.approve(address(lightMain), 100);
        lightMain.shareLightForCreators(_pid, 0);
        return true;
    }

    // fetch ETH for test
    function transferCreateAreaFee() public {
        msg.sender.transfer(address(this).balance);
    }

}
