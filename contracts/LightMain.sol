pragma solidity 0.6.12;


import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./LightToken.sol";


interface IMigratorLight {
    enum Platform{
        uniswap,
        sushiswap
    }
    // Perform LP token migration from legacy UniswapV2 to LightSwap.
    // Take the current LP token address and return the new LP token address.
    // Migrator should have full access to the caller's LP token.
    // Return the new LP token address.
    //
    // XXX Migrator must have allowance access to UniswapV2 LP tokens.
    // LightSwap must mint EXACTLY the same amount of LightSwap LP tokens or
    // else something bad will happen. Traditional UniswapV2 does not
    // do that so be careful!
    function migrate(IERC20 token, Platform platform) external returns (IERC20);
}

// LightMain is the master of Light. He can make Light and he is a fair guy.
//
// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once LIGHT is sufficiently
// distributed and the community can show to govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.
contract LightMain is Ownable {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant MinMinters = 20;

    enum Region{
        master,
        slave
    }

    // Info of each user.
    struct UserInfo {
        uint256 amount;     // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of LIGHTs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accLightPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accLightPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
        uint256 accReward;
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken;           // Address of LP token contract.
        uint256 allocPoint;       // How many allocation points assigned to this pool. LIGHTs to distribute per block.
        uint256 lastRewardBlock;  // Last block number that LIGHTs distribution occurs.
        uint256 accLightPerShare; // Accumulated LIGHTs per share, times 1e12. See below.
        // Lock LP, until the end of mining.
        bool lock;
    }

    // The LIGHT TOKEN!
    LightToken public light;
    // LIGHT tokens created per block.
    uint256 public lightPerBlock;
    // The migrator contract. It has a lot of power. Can only be set through governance (owner).
    IMigratorLight public migrator;
    // The buy back contract.
    address public buyBackContract;
    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping (uint256 => mapping (address => UserInfo)) public userInfo;
    // Total allocation poitns. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when LIGHT mining starts.
    uint256 public startBlock;
    uint256 public halfPeriod;
    uint256 public maxBlocks;
    uint256 public maxSupply;
    uint256 public createAreaFee;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

    constructor(
        LightToken _light,
        uint256 _createAreaFee,
        uint256 _lightPerBlock,
        uint256 _startBlock,
        uint256 _halfPeriod,
        uint256 _maxBlocks,
        uint256 _maxSupply
    ) public {
        light = _light;
        createAreaFee = _createAreaFee;
        lightPerBlock = _lightPerBlock;
        startBlock = _startBlock;
        halfPeriod = _halfPeriod;
        maxBlocks = _maxBlocks;
        maxSupply = _maxSupply;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(uint256 _allocPoint, IERC20 _lpToken, bool _withUpdate, bool _lock) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools(Region.master);
        }
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(PoolInfo({
            lpToken: _lpToken,
            allocPoint: _allocPoint,
            lastRewardBlock: lastRewardBlock,
            accLightPerShare: 0,
            lock: _lock
        }));
    }

    // Update the given pool's LIGHT allocation point. Can only be called by the owner.
    function set(uint256 _pid, uint256 _allocPoint, bool _withUpdate) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools(Region.master);
        }
        totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(_allocPoint);
        poolInfo[_pid].allocPoint = _allocPoint;
    }

    // View function to see pending LIGHTs on frontend.
    function pendingLight(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accLightPerShare = pool.accLightPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 blockRewards = getBlockRewards(pool.lastRewardBlock, block.number, Region.master);
            uint256 lightReward = blockRewards.mul(pool.allocPoint).div(totalAllocPoint);
            accLightPerShare = accLightPerShare.add(lightReward.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(accLightPerShare).div(1e12).sub(user.rewardDebt);
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools(Region region) public {
        if(region == Region.master){
            uint256 length = poolInfo.length;
            for (uint256 pid = 0; pid < length; ++pid) {
                updatePool(pid);
            }
        }else if(region == Region.master){
            uint256 length = slavePoolInfo.length;
            for (uint256 pid = 0; pid < length; ++pid) {
                updateSlavePool(pid);
            }
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 blockRewards = getBlockRewards(pool.lastRewardBlock, block.number, Region.master);
        uint256 lightReward = blockRewards.mul(pool.allocPoint).div(totalAllocPoint);
        light.mint(address(this), lightReward);
        pool.accLightPerShare = pool.accLightPerShare.add(lightReward.mul(1e12).div(lpSupply));
        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to LightMain for LIGHT allocation.
    function deposit(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accLightPerShare).div(1e12).sub(user.rewardDebt);
            if(pending > 0) {
                safeLightTransfer(msg.sender, pending);
                user.accReward = user.accReward.add(pending);
            }
        }
        if(_amount > 0) {
            pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.accLightPerShare).div(1e12);
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from LightMain.
    function withdraw(uint256 _pid, uint256 _amount) public {
        PoolInfo storage pool = poolInfo[_pid];
        require(pool.lock == false || pool.lock && block.number >= (startBlock + maxBlocks + 5760));
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool(_pid);
        uint256 pending = user.amount.mul(pool.accLightPerShare).div(1e12).sub(user.rewardDebt);
        if(pending > 0) {
            safeLightTransfer(msg.sender, pending);
            user.accReward = user.accReward.add(pending);
        }
        if(_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.lpToken.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(pool.accLightPerShare).div(1e12);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // Safe light transfer function, just in case if rounding error causes pool to not have enough LIGHTs.
    function safeLightTransfer(address _to, uint256 _amount) internal {
        uint256 lightBal = light.balanceOf(address(this));
        if (_amount > lightBal) {
            light.transfer(_to, lightBal);
        } else {
            light.transfer(_to, _amount);
        }
    }

    // Reduce by 50% per halfPeriod blocks.
    function getBlockReward(uint256 number, Region region) public view returns (uint256) {
        if (number < startBlock){
            return 0;
        }
        uint256 mintBlocks = number.sub(startBlock);
        if (mintBlocks >= maxBlocks){
            return 0;
        }
        uint256 exp = mintBlocks.div(halfPeriod);
        uint256 blockReward = lightPerBlock.mul(5 ** exp).div(10 ** exp);
        if(blockReward > 0 && blockReward <= lightPerBlock){
            if(region == Region.master){
                return blockReward.mul(8).div(10);
            }
            if(region == Region.slave){
                return blockReward.mul(2).div(10);
            }
            return blockReward;
        }
        return 0;
    }

    function getBlockRewardNow() public view returns (uint256) {
        return getBlockReward(block.number, Region.master) + getBlockReward(block.number, Region.slave);
    }

    function getBlockRewards(uint256 from, uint256 to, Region region) public view returns (uint256) {
        if(light.totalSupply() >= maxSupply){
            return 0;
        }
        if(from < startBlock){
            from = startBlock;
        }
        if(to > startBlock.add(maxBlocks)){
            to = startBlock.add(maxBlocks).sub(1);
        }
        if(from >= to){
            return 0;
        }
        uint256 blockReward1 = getBlockReward(from, region);
        uint256 blockReward2 = getBlockReward(to, region);
        uint256 blockGap = to.sub(from);
        if(blockReward1 != blockReward2){
            uint256 blocks2 = to.mod(halfPeriod);
            if(blockGap < blocks2){
                return 0;
            }
            uint256 blocks1 = blockGap.sub(blocks2);
            return blocks1.mul(blockReward1).add(blocks2.mul(blockReward2));
        }
        return blockGap.mul(blockReward1);
    }

    // ------------------------------------------------------------
    // --- SLAVE POOLs AND AREAs
    // ------------------------------------------------------------

    event SlaveDeposit(address indexed user, uint256 indexed pid, uint256 amount);
    event SlaveWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event SlaveEmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

    // Info of each area.
    struct AreaInfo {
        address creator;
        uint256 creationBlock;
        uint256 members;
        uint256 amount;
        uint256 rewardDebt;
        string name;
    }

    // Info of each area that stakes LP tokens.
    mapping (uint256 => AreaInfo[]) public areaInfo;

    struct SlaveUserInfo {
        uint256 aid;
        uint256 amount;     // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of LIGHTs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accLightPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accLightPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
        uint256 accReward;
    }

    // Info of each pool.
    struct SlavePoolInfo {
        IERC20 lpToken;           // Address of LP token contract.
        uint256 allocPoint;       // How many allocation points assigned to this pool. LIGHTs to distribute per block.
        uint256 lastRewardBlock;  // Last block number that LIGHTs distribution occurs.
        uint256 minerAccLightPerShare; // Accumulated LIGHTs per share, times 1e12. See below.
        uint256 creatorAccLightPerShare; // Accumulated LIGHTs per share, times 1e12. See below.
        uint256 totalBadAreaBalance;
        uint256 ethForBuyBack;
    }

    // Info of each pool.
    SlavePoolInfo[] public slavePoolInfo;
    // Info of each user that stakes LP tokens.
    mapping (uint256 => mapping (address => SlaveUserInfo)) public slaveUserInfo;
    uint256 public slaveTotalAllocPoint = 0;

    function createArea(uint256 _pid, string memory _name) payable public  {
        require(msg.value == createAreaFee);
        areaInfo[_pid].push(AreaInfo({
            creator: msg.sender,
            creationBlock: block.number,
            members: 0,
            amount: 0,
            rewardDebt: 0,
            name: _name
        }));
        // Buy back LIGHTs for creators.
        SlavePoolInfo storage pool = slavePoolInfo[_pid];
        if(buyBackContract != address(0)){
            bytes memory callData = abi.encodeWithSignature("buyBackLightForCreators(uint256)", _pid);
            (bool success, ) = buyBackContract.call{value: pool.ethForBuyBack.add(msg.value)}(callData);
            if(success){
                pool.ethForBuyBack = 0;
            }
        }else{
            pool.ethForBuyBack = pool.ethForBuyBack.add(createAreaFee);
        }
    }

    function slavePoolLength() external view returns (uint256) {
        return slavePoolInfo.length;
    }

    function areaLength(uint256 _pid) external view returns (uint256) {
        return areaInfo[_pid].length;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function addSlavePool(uint256 _allocPoint, IERC20 _lpToken, bool _withUpdate) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools(Region.slave);
        }
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        slaveTotalAllocPoint = slaveTotalAllocPoint.add(_allocPoint);
        slavePoolInfo.push(SlavePoolInfo({
            lpToken: _lpToken,
            allocPoint: _allocPoint,
            lastRewardBlock: lastRewardBlock,
            minerAccLightPerShare: 0,
            creatorAccLightPerShare: 0,
            totalBadAreaBalance: 0,
            ethForBuyBack: 0
        }));
    }

    // Update the given pool's LIGHT allocation point. Can only be called by the owner.
    function setSlavePool(uint256 _pid, uint256 _allocPoint, bool _withUpdate) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools(Region.slave);
        }
        slaveTotalAllocPoint = slaveTotalAllocPoint.sub(slavePoolInfo[_pid].allocPoint).add(_allocPoint);
        slavePoolInfo[_pid].allocPoint = _allocPoint;
    }

    function slavePendingLightByAid(uint256 _pid, uint256 _aid, address _user) external view returns (uint256) {
        if(slaveUserInfo[_pid][_user].aid != _aid){
            return 0;
        }
        return slavePendingLight(_pid, _user);
    }

    // View function to see pending LIGHTs on frontend.
    function slavePendingLight(uint256 _pid, address _user) public view returns (uint256) {
        SlavePoolInfo storage pool = slavePoolInfo[_pid];
        SlaveUserInfo storage user = slaveUserInfo[_pid][_user];
        uint256 minerAccLightPerShare = pool.minerAccLightPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 blockRewards = getBlockRewards(pool.lastRewardBlock, block.number, Region.slave);
            uint256 lightReward = blockRewards.mul(pool.allocPoint).div(slaveTotalAllocPoint);
            uint256 lightRewardForMiner = lightReward.mul(95).div(100);
            minerAccLightPerShare = minerAccLightPerShare.add(lightRewardForMiner.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(minerAccLightPerShare).div(1e12).sub(user.rewardDebt);
    }

    function slavePendingLightForCreatorByAid(uint256 _pid, uint256 _aid, address _user) external view returns (uint256) {
        if(slaveUserInfo[_pid][_user].aid != _aid){
            return 0;
        }
        return slavePendingLightForCreator(_pid, _user);
    }

    function slavePendingLightForCreator(uint256 _pid, address _user) public view returns (uint256) {
        SlaveUserInfo storage user = slaveUserInfo[_pid][_user];
        AreaInfo storage area = areaInfo[_pid][user.aid];
        if(area.creator != _user || area.members < MinMinters){
            return 0;
        }
        SlavePoolInfo storage pool = slavePoolInfo[_pid];
        uint256 creatorAccLightPerShare = pool.creatorAccLightPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 blockRewards = getBlockRewards(pool.lastRewardBlock, block.number, Region.slave);
            uint256 lightReward = blockRewards.mul(pool.allocPoint).div(slaveTotalAllocPoint);
            uint256 lightRewardForCreator = lightReward.mul(5).div(100);
            uint256 lpSupply2 = lpSupply.sub(pool.totalBadAreaBalance);
            if(lpSupply2 > 0){
                creatorAccLightPerShare = creatorAccLightPerShare.add(lightRewardForCreator.mul(1e12).div(lpSupply2));
            }
        }
        return area.amount.mul(creatorAccLightPerShare).div(1e12).sub(area.rewardDebt);
    }

    // Update reward variables of the given pool to be up-to-date.
    function updateSlavePool(uint256 _pid) public {
        SlavePoolInfo storage pool = slavePoolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 blockReward = getBlockRewards(pool.lastRewardBlock, block.number, Region.slave);
        uint256 lightReward = blockReward.mul(pool.allocPoint).div(slaveTotalAllocPoint);
        uint256 lightRewardForMiner = lightReward.mul(95).div(100);
        uint256 lightRewardForCreator = lightReward.sub(lightRewardForMiner);
        pool.minerAccLightPerShare = pool.minerAccLightPerShare.add(lightRewardForMiner.mul(1e12).div(lpSupply));
        uint256 lpSupply2 = lpSupply.sub(pool.totalBadAreaBalance);
        if(lpSupply2 > 0){
            pool.creatorAccLightPerShare = pool.creatorAccLightPerShare.add(lightRewardForCreator.mul(1e12).div(lpSupply2));
            light.mint(address(this), lightReward);
        }else{
            light.mint(address(this), lightRewardForMiner);
        }
        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to LightMain for LIGHT allocation.
    function slaveDeposit(uint256 _pid, uint256 _aid, uint256 _amount) public {
        AreaInfo storage area = areaInfo[_pid][_aid];
        require(area.creator != address(0), "invalid area");
        SlavePoolInfo storage pool = slavePoolInfo[_pid];
        SlaveUserInfo storage user = slaveUserInfo[_pid][msg.sender];
        updateSlavePool(_pid);
        if (user.amount > 0) {
            require(user.aid == _aid, "deposit: invalid aid");
            uint256 minerPending = user.amount.mul(pool.minerAccLightPerShare).div(1e12).sub(user.rewardDebt);
            if(minerPending > 0) {
                safeLightTransfer(msg.sender, minerPending);
                user.accReward = user.accReward.add(minerPending);
            }
        }
        if(area.members >= MinMinters){
            uint256 creatorPending = area.amount.mul(pool.creatorAccLightPerShare).div(1e12).sub(area.rewardDebt);
            if(creatorPending > 0) {
                safeLightTransfer(area.creator, creatorPending);
                SlaveUserInfo storage creatorInfo = slaveUserInfo[_pid][area.creator];
                creatorInfo.accReward = creatorInfo.accReward.add(creatorPending);
            }
        }
        if(_amount > 0) {
            pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            // First deposit
            if(user.amount == 0){
                user.aid = _aid;
                area.members = area.members.add(1);
                if(area.members == MinMinters){
                    pool.totalBadAreaBalance = pool.totalBadAreaBalance.sub(area.amount);
                }
            }
            if(area.members < MinMinters){
                pool.totalBadAreaBalance = pool.totalBadAreaBalance.add(_amount);
            }
            user.amount = user.amount.add(_amount);
            area.amount = area.amount.add(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.minerAccLightPerShare).div(1e12);
        area.rewardDebt = area.amount.mul(pool.creatorAccLightPerShare).div(1e12);
        emit SlaveDeposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from LightMain.
    function slaveWithdraw(uint256 _pid, uint256 _amount) public {
        SlavePoolInfo storage pool = slavePoolInfo[_pid];
        SlaveUserInfo storage user = slaveUserInfo[_pid][msg.sender];
        AreaInfo storage area = areaInfo[_pid][user.aid];
        require(user.amount >= _amount, "withdraw: not good");
        updateSlavePool(_pid);
        uint256 minerPending = user.amount.mul(pool.minerAccLightPerShare).div(1e12).sub(user.rewardDebt);
        if(minerPending > 0) {
            safeLightTransfer(msg.sender, minerPending);
            user.accReward = user.accReward.add(minerPending);
        }
        if(area.members >= MinMinters){
            uint256 creatorPending = area.amount.mul(pool.creatorAccLightPerShare).div(1e12).sub(area.rewardDebt);
            if(creatorPending > 0) {
                safeLightTransfer(area.creator, creatorPending);
                SlaveUserInfo storage creatorInfo = slaveUserInfo[_pid][area.creator];
                creatorInfo.accReward = creatorInfo.accReward.add(creatorPending);
            }
        }
        if(_amount > 0) {
            user.amount = user.amount.sub(_amount);
            if(user.amount == 0){
                if(area.members == MinMinters){
                    pool.totalBadAreaBalance = pool.totalBadAreaBalance.add(area.amount);
                }
                area.members = area.members.sub(1);
            }
            if(area.members < MinMinters){
                pool.totalBadAreaBalance = pool.totalBadAreaBalance.sub(_amount);
            }
            area.amount = area.amount.sub(_amount);
            pool.lpToken.safeTransfer(address(msg.sender), _amount);
        }
        area.rewardDebt = area.amount.mul(pool.creatorAccLightPerShare).div(1e12);
        user.rewardDebt = user.amount.mul(pool.minerAccLightPerShare).div(1e12);
        emit SlaveWithdraw(msg.sender, _pid, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function slaveEmergencyWithdraw(uint256 _pid) public {
        SlavePoolInfo storage pool = slavePoolInfo[_pid];
        SlaveUserInfo storage user = slaveUserInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit SlaveEmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    function setBuyBackContract(address _buyBackContract) public onlyOwner {
        buyBackContract = _buyBackContract;
    }

    // Share LIGHTs for creators;
    function shareLightForCreators(uint256 _pid, uint256 _amount) public {
        SlavePoolInfo storage pool = slavePoolInfo[_pid];
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        uint256 lpSupply2 = lpSupply.sub(pool.totalBadAreaBalance);
        if(lpSupply2 > 0){
            light.transferFrom(msg.sender, address(this), _amount);
            pool.creatorAccLightPerShare = pool.creatorAccLightPerShare.add(_amount.mul(1e12).div(lpSupply2));
        }
    }

    function manualBuyBack(uint256 _pid) public onlyOwner {
        SlavePoolInfo storage pool = slavePoolInfo[_pid];
        require(buyBackContract != address(0) && pool.ethForBuyBack > 0);
        bytes memory callData = abi.encodeWithSignature("buyBackLightForCreators(uint256)", _pid);
        (bool success, ) = buyBackContract.call{value: pool.ethForBuyBack}(callData);
        if(success){
            pool.ethForBuyBack = 0;
        }
    }

    // ---------------------------------------
    // Migrate
    // ---------------------------------------

    // Set the migrator contract. Can only be called by the owner.
    function setMigrator(IMigratorLight _migrator) public onlyOwner {
        migrator = _migrator;
    }

    // Migrate lp token to another lp contract. Can be called by anyone. We trust that migrator contract is good.
    function migrate(uint256 _pid, Region region, IMigratorLight.Platform platform) public {
        require(address(migrator) != address(0), "migrate: no migrator");
        if(region == Region.master){
            PoolInfo storage pool = poolInfo[_pid];
            IERC20 lpToken = pool.lpToken;
            uint256 bal = lpToken.balanceOf(address(this));
            lpToken.safeApprove(address(migrator), bal);
            IERC20 newLpToken = migrator.migrate(lpToken, platform);
            require(bal == newLpToken.balanceOf(address(this)), "migrate: bad");
            pool.lpToken = newLpToken;
        }else if(region == Region.slave){
            SlavePoolInfo storage pool = slavePoolInfo[_pid];
            IERC20 lpToken = pool.lpToken;
            uint256 bal = lpToken.balanceOf(address(this));
            lpToken.safeApprove(address(migrator), bal);
            IERC20 newLpToken = migrator.migrate(lpToken, platform);
            require(bal == newLpToken.balanceOf(address(this)), "migrate: bad");
            pool.lpToken = newLpToken;
        }
    }

}
