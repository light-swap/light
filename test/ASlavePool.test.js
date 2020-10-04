const { expectRevert, time } = require('@openzeppelin/test-helpers');
const LightToken = artifacts.require('LightToken');
const LightMain = artifacts.require('LightMain');
const MockERC20 = artifacts.require('MockERC20');

contract('LightMain', ([alice, bob, carol, dev, minter]) => {
    beforeEach(async () => {
        this.lightToken = await LightToken.new({ from: alice });
    });

    it('should set correct state variables', async () => {
        this.LightMain = await LightMain.new(this.lightToken.address, '1', '10', '0', '100000', '10000000', '1000000000', { from: alice });
        await this.lightToken.transferOwnership(this.LightMain.address, { from: alice });
        const light = await this.LightMain.light();
        const owner = await this.lightToken.owner();
        assert.equal(light.valueOf(), this.lightToken.address);
        assert.equal(owner.valueOf(), this.LightMain.address);
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
            await this.LightMain.addSlavePool('100', this.lp.address, true);
            await this.lp.approve(this.LightMain.address, '1000', { from: bob });
            await this.LightMain.createArea(0, "test1", {from: bob, value: 1});
            await this.LightMain.slaveDeposit(0, 0, '100', { from: bob });
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '900');
            await this.LightMain.slaveEmergencyWithdraw(0, { from: bob });
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1000');
            await this.LightMain.transferCreateAreaFee(dev, 1, {from: alice});
        });

        it('should give out blockReward only after farming time', async () => {
            // 2000 per block farming rate starting at block 100
            this.LightMain = await LightMain.new(this.lightToken.address, '1', '10000', '100', '100', '500', '10000000000000000', { from: alice });
            assert.equal((await this.LightMain.getBlockReward(0, 1)).valueOf(), '0');
            assert.equal((await this.LightMain.getBlockReward(99, 1)).valueOf(), '0');
            assert.equal((await this.LightMain.getBlockReward(100, 1)).valueOf(), '2000');
            assert.equal((await this.LightMain.getBlockReward(199, 1)).valueOf(), '2000');
            assert.equal((await this.LightMain.getBlockReward(200, 1)).valueOf(), '1000');
            assert.equal((await this.LightMain.getBlockReward(300, 1)).valueOf(), '500');
            assert.equal((await this.LightMain.getBlockReward(400, 1)).valueOf(), '250');
            assert.equal((await this.LightMain.getBlockReward(500, 1)).valueOf(), '125');
            assert.equal((await this.LightMain.getBlockReward(599, 1)).valueOf(), '125');
            assert.equal((await this.LightMain.getBlockReward(600, 1)).valueOf(), '0');
            assert.equal((await this.LightMain.getBlockReward(10000000000000, 1)).valueOf(), '0');
            assert.equal((await this.LightMain.getBlockRewards(9, 99, 1)).valueOf(), '0');
            assert.equal((await this.LightMain.getBlockRewards(199, 201, 1)).valueOf(), '3000');
            assert.equal((await this.LightMain.getBlockRewards(598, 666, 1)).valueOf(), '125');
            assert.equal((await this.LightMain.getBlockRewards(401, 411, 1)).valueOf(), '2500');
        });

        it('should give out LIGHTs only after farming time', async () => {
            // 200 per block farming rate starting at block 100
            this.LightMain = await LightMain.new(this.lightToken.address, '1', '1000', '100', '1000', '50000', '10000000000000000', { from: alice });
            await this.lightToken.transferOwnership(this.LightMain.address, { from: alice });
            await this.LightMain.addSlavePool('100', this.lp.address, true);
            await this.lp.approve(this.LightMain.address, '1000', { from: bob });
            await this.LightMain.createArea(0, "test1", {from: minter, value: 1});
            await this.LightMain.slaveDeposit(0, 0, '100', { from: bob });
            await time.advanceBlockTo('89');
            await this.LightMain.slaveDeposit(0, 0, '0', { from: bob }); // block 90
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '0');
            await time.advanceBlockTo('94');
            await this.LightMain.slaveDeposit(0, 0, '0', { from: bob }); // block 95
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '0');
            await time.advanceBlockTo('99');
            await this.LightMain.slaveDeposit(0, 0, '0', { from: bob }); // block 100
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '0');
            await time.advanceBlockTo('100');
            await this.LightMain.slaveDeposit(0, 0, '0', { from: bob }); // block 101
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '190');
            await time.advanceBlockTo('104');
            await this.LightMain.slaveDeposit(0, 0, '0', { from: bob }); // block 105
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '950');
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '950');
            await this.lp.approve(this.LightMain.address, '1000', { from: alice }); // block 106
            await this.lp.approve(this.LightMain.address, '1000', { from: carol }); // block 107
            await this.LightMain.slaveDeposit(0, 0, '100', { from: alice }); // block 108
            await this.LightMain.slaveDeposit(0, 0, '100', { from: carol }); // block 109
            await this.LightMain.slaveDeposit(0, 0, '0', { from: alice }); // block 110
            await this.LightMain.slaveDeposit(0, 0, '0', { from: carol }); // block 111
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '2120');
            assert.equal((await this.lightToken.balanceOf(minter)).valueOf(), '29');
        });

        it('should not distribute LIGHTs if no one deposit', async () => {
            // 8000 per block farming rate starting at block 200
            this.LightMain = await LightMain.new(this.lightToken.address, '1', '40000', '200', '1000', '50000', '10000000000000000', { from: alice });
            await this.lightToken.transferOwnership(this.LightMain.address, { from: alice });
            await this.LightMain.addSlavePool('100', this.lp.address, true);
            await this.LightMain.createArea(0, "test1", {from: dev, value: 1});
            await this.lp.approve(this.LightMain.address, '1000', { from: bob });
            await time.advanceBlockTo('199');
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '0');
            await time.advanceBlockTo('204');
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '0');
            await time.advanceBlockTo('209');
            await this.LightMain.slaveDeposit(0, 0, '10', { from: bob }); // block 210
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '0');
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '0');
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '990');
            await time.advanceBlockTo('219');
            await this.LightMain.slaveWithdraw(0, '10', { from: bob }); // block 220
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '76000');
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '76000');
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1000');
        });

        it('should distribute LIGHTs properly for each staker', async () => {
            // 1000 per block farming rate starting at block 300
            this.LightMain = await LightMain.new(this.lightToken.address, '1', '5000', '300', '1000', '50000', '61811', { from: alice });
            await this.lightToken.transferOwnership(this.LightMain.address, { from: alice });
            await this.LightMain.addSlavePool('100', this.lp.address, true);
            await this.LightMain.createArea(0, "test1", { from: minter, value: 1 });
            await this.lp.approve(this.LightMain.address, '1000', { from: alice });
            await this.lp.approve(this.LightMain.address, '1000', { from: bob });
            await this.lp.approve(this.LightMain.address, '1000', { from: carol });
            // Alice deposits 10 LPs at block 310
            await time.advanceBlockTo('309');
            await this.LightMain.slaveDeposit(0, 0, '10', { from: alice });
            // Bob deposits 20 LPs at block 314
            await time.advanceBlockTo('313');
            await this.LightMain.slaveDeposit(0, 0, '20', { from: bob });
            await time.advanceBlockTo('317');
            await this.LightMain.slaveDeposit(0, 0, '30', { from: carol });
            //await this.LightMain.slaveDeposit(0, 0, '0', { from: alice });
            // Alice deposits 10 more LPs at block 320. At this point:
            //   Alice should have: 4*950 + 4*1/3*950 + 2*1/6*950 = 5383
            await time.advanceBlockTo('319');
            await this.LightMain.slaveDeposit(0, 0, '10', { from: alice });
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '9800');
            assert.equal((await this.lightToken.balanceOf(minter)).valueOf(), '299');
            assert.equal((await this.lightToken.balanceOf(alice)).valueOf(), '5383');
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '0');
            assert.equal((await this.lightToken.balanceOf(carol)).valueOf(), '0');
            assert.equal((await this.lightToken.balanceOf(this.LightMain.address)).valueOf(), '4118');
            // Bob withdraws 6 LPs at block 330. At this point:
            //   Bob should have: 4*2/3*950 + 2*2/6*950 + 10*2/7*950 = 5880
            await time.advanceBlockTo('329');
            await this.LightMain.slaveWithdraw(0, '5', { from: bob });
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '19800');
            assert.equal((await this.lightToken.balanceOf(minter)).valueOf(), '799');
            assert.equal((await this.lightToken.balanceOf(alice )).valueOf(), '5383');
            assert.equal((await this.lightToken.balanceOf(bob   )).valueOf(), '5880');
            assert.equal((await this.lightToken.balanceOf(carol )).valueOf(), '0');
            assert.equal((await this.lightToken.balanceOf(this.LightMain.address)).valueOf(), '7738');
            // Alice withdraws 20 LPs at block 340.
            // Bob withdraws 15 LPs at block 350.
            // Carol withdraws 30 LPs at block 360.
            await time.advanceBlockTo('339')
            await this.LightMain.slaveWithdraw(0, '20', { from: alice });
            await time.advanceBlockTo('349')
            await this.LightMain.slaveWithdraw(0, '15', { from: bob });
            await time.advanceBlockTo('359')
            await this.LightMain.slaveWithdraw(0, '30', { from: carol });
            assert.equal((await this.lightToken.totalSupply()).valueOf(), '49300');
            // Alice should have: 5383 + 10*2/7*950 + 10*2/6.5*950 = 11600
            assert.equal((await this.lightToken.balanceOf(alice)).valueOf(), '11021');
            // Bob should have: 5880 + 10*1.5/6.5*950 + 10*1.5/4.5*950 = 11239
            assert.equal((await this.lightToken.balanceOf(bob)).valueOf(), '11239');
            // Carol should have: 2*3/6*950 + 10*3/7*950 + 10*3/6.5*950 + 10*3/4.5*950 + 10*950 = 25240
            assert.equal((await this.lightToken.balanceOf(carol)).valueOf(), '25240');
            // All of them should have 1000 LPs back.
            assert.equal((await this.lp.balanceOf(alice)).valueOf(), '1000');
            assert.equal((await this.lp.balanceOf(bob)).valueOf(), '1000');
            assert.equal((await this.lp.balanceOf(carol)).valueOf(), '1000');
            assert.equal((await this.lightToken.balanceOf(minter)).valueOf(), '1799');
            await time.advanceBlockTo('368')
            await this.LightMain.slaveDeposit(0, 0, '10', { from: alice });
            assert.equal((await this.LightMain.slavePendingLightForCreator(0, minter)).valueOf(), '0');
            await this.LightMain.slaveDeposit(0, 0, '10', { from: bob });
            await time.advanceBlockTo('379')
            assert.equal((await this.LightMain.slavePendingLightForCreator(0, minter)).valueOf(), '450');
            await this.LightMain.slaveWithdraw(0, '10', { from: bob });
            assert.equal((await this.LightMain.slavePendingLightForCreator(0, minter)).valueOf(), '0');
            assert.equal((await this.lightToken.balanceOf(minter)).valueOf(), '2299');

            await this.LightMain.slaveWithdraw(0, '10', { from: alice });
            await this.LightMain.addSlavePool('100', this.lp.address, true);
            await this.LightMain.addSlavePool('100', this.lp.address, true);
            await this.LightMain.createArea(2, "test2", { from: minter, value: 1 });
            await this.LightMain.createArea(2, "test3", { from: minter, value: 1 });
            await this.LightMain.slaveDeposit(2, 1, '10', { from: alice });
            await this.LightMain.slaveDeposit(2, 1, '10', { from: bob });
            await this.LightMain.slaveWithdraw(2, '1', { from: bob });
            await this.LightMain.slaveDeposit(2, 1, '10', { from: bob });
            await this.LightMain.slaveWithdraw(2, '19', { from: bob });
            console.log((await this.LightMain.slavePendingLightForCreator(0, minter)).valueOf());
        });
    });
});
