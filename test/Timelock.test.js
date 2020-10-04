const { expectRevert, time } = require('@openzeppelin/test-helpers');
const ethers = require('ethers');
const LightToken = artifacts.require('LightToken');
const LightMain = artifacts.require('LightMain');
const MockERC20 = artifacts.require('MockERC20');
const Timelock = artifacts.require('Timelock');

function encodeParameters(types, values) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

contract('Timelock', ([alice, bob, carol, dev, minter]) => {
    beforeEach(async () => {
        this.lightToken = await LightToken.new({ from: alice });
        this.timelock = await Timelock.new(bob, '259200', { from: alice });
    });

    it('should not allow non-owner to do operation', async () => {
        await this.lightToken.transferOwnership(this.timelock.address, { from: alice });
        await expectRevert(
            this.lightToken.transferOwnership(carol, { from: alice }),
            'Ownable: caller is not the owner',
        );
        await expectRevert(
            this.lightToken.transferOwnership(carol, { from: bob }),
            'Ownable: caller is not the owner',
        );
        await expectRevert(
            this.timelock.queueTransaction(
                this.lightToken.address, '0', 'transferOwnership(address)',
                encodeParameters(['address'], [carol]),
                (await time.latest()).add(time.duration.days(4)),
                { from: alice },
            ),
            'Timelock::queueTransaction: Call must come from admin.',
        );
    });

    it('should do the timelock thing', async () => {
        await this.lightToken.transferOwnership(this.timelock.address, { from: alice });
        const eta = (await time.latest()).add(time.duration.days(4));
        await this.timelock.queueTransaction(
            this.lightToken.address, '0', 'transferOwnership(address)',
            encodeParameters(['address'], [carol]), eta, { from: bob },
        );
        await time.increase(time.duration.days(1));
        await expectRevert(
            this.timelock.executeTransaction(
                this.lightToken.address, '0', 'transferOwnership(address)',
                encodeParameters(['address'], [carol]), eta, { from: bob },
            ),
            "Timelock::executeTransaction: Transaction hasn't surpassed time lock.",
        );
        await time.increase(time.duration.days(4));
        await this.timelock.executeTransaction(
            this.lightToken.address, '0', 'transferOwnership(address)',
            encodeParameters(['address'], [carol]), eta, { from: bob },
        );
        assert.equal((await this.lightToken.owner()).valueOf(), carol);
    });

    it('should also work with LightMain', async () => {
        this.lp1 = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
        this.lp2 = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
        this.lightMain = await LightMain.new(this.lightToken.address, '1', '1000', '0', '1000', '25000', '420000000000000000000000', { from: alice });
        await this.lightToken.transferOwnership(this.lightMain.address, { from: alice });
        await this.lightMain.add('100', this.lp1.address, true, false);
        await this.lightMain.transferOwnership(this.timelock.address, { from: alice });
        const eta = (await time.latest()).add(time.duration.days(4));
        await this.timelock.queueTransaction(
            this.lightMain.address, '0', 'set(uint256,uint256,bool)',
            encodeParameters(['uint256', 'uint256', 'bool'], ['0', '200', false]), eta, { from: bob },
        );
        await this.timelock.queueTransaction(
            this.lightMain.address, '0', 'add(uint256,address,bool,bool)',
            encodeParameters(['uint256', 'address', 'bool', 'bool'], ['100', this.lp2.address, false, false]), eta, { from: bob },
        );
        await time.increase(time.duration.days(4));
        await this.timelock.executeTransaction(
            this.lightMain.address, '0', 'set(uint256,uint256,bool)',
            encodeParameters(['uint256', 'uint256', 'bool'], ['0', '200', false]), eta, { from: bob },
        );
        await this.timelock.executeTransaction(
            this.lightMain.address, '0', 'add(uint256,address,bool,bool)',
            encodeParameters(['uint256', 'address', 'bool', 'bool'], ['100', this.lp2.address, false, false]), eta, { from: bob },
        );
        assert.equal((await this.lightMain.poolInfo('0')).valueOf().allocPoint, '200');
        assert.equal((await this.lightMain.totalAllocPoint()).valueOf(), '300');
        assert.equal((await this.lightMain.poolLength()).valueOf(), '2');
    });
});
