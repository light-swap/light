const { expectRevert, time } = require('@openzeppelin/test-helpers');
const LightToken = artifacts.require('LightToken');
const BuyBack = artifacts.require('BuyBack');
const LightMain = artifacts.require('LightMain');
const MockERC20 = artifacts.require('MockERC20');

contract('LightMain', ([alice, bob, carol, dev, minter]) => {
    beforeEach(async () => {
        this.lightToken = await LightToken.new({ from: alice });
    });

    context('With ERC/LP token added to the field', () => {
        beforeEach(async () => {
            this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
            await this.lp.transfer(alice, '1000', { from: minter });
            await this.lp.transfer(bob, '1000', { from: minter });
            await this.lp.transfer(carol, '1000', { from: minter });
            this.lp2 = await MockERC20.new('LPToken2', 'LP2', '10000000000', { from: minter });
            await this.lp2.transfer(alice, '1000', { from: minter });
            await this.lp2.transfer(bob, '1000', { from: minter });
            await this.lp2.transfer(carol, '1000', { from: minter });
        });

        it('should allow emergency withdraw', async () => {
            // 10 per block farming rate starting at block 100
            this.LightMain = await LightMain.new(this.lightToken.address, '1', '10', '100', '100000', '10000000', '1000000000', { from: alice });
            this.buyBack = await BuyBack.new(this.LightMain.address, this.lightToken.address, { from: alice });
            this.lightToken.mint(this.buyBack.address, 100);
            await this.LightMain.setBuyBackContract(this.buyBack.address);
            await this.LightMain.addSlavePool('100', this.lp.address, true);
            await this.lp.approve(this.LightMain.address, '1000', { from: bob });
            await this.LightMain.createArea(0, "test1", {from: bob, value: 1});
            await this.LightMain.slaveDeposit(0, 0, '100', { from: bob });
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '900');
            await this.LightMain.slaveEmergencyWithdraw(0, { from: bob });
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1000');
            console.log("buyBackContract:", (await this.LightMain.buyBackContract()).valueOf().toString());
        });
    });
});
