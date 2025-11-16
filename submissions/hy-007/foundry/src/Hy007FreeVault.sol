// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "./interfaces/IPool.sol";
import {IPool} from "./interfaces/IPool.sol";

/**
 * @title Hy007FreeVault
 * @notice Leveraged yield vault that uses HypurrFi's lending protocol
 * @dev Implements one-click leverage looping strategy
 */
contract Hy007FreeVault {
    // Reentrancy guard
    uint256 private _status;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
    // Structs
    struct UserPosition {
        uint256 shares;
        uint256 underlyingAssets;
        uint256 collateralValue;
        uint256 debtValue;
        uint256 netValue;
        uint256 healthFactor;
        uint256 currentLTV;
        uint256 leverageRatio;
    }

    struct VaultStats {
        uint256 totalShares;
        uint256 totalAssets;
        uint256 totalCollateral;
        uint256 totalDebt;
        uint256 currentAPY;
        uint256 healthFactor;
        address collateralAsset;
        address borrowAsset;
    }

    // State variables
    IPool public immutable pool;
    IERC20 public immutable depositAsset;
    IERC20 public immutable borrowAsset;
    address public immutable hyToken;
    address public owner;

    uint256 public targetLTV = 7000;  // 70%
    uint256 public maxLTV = 7500;     // 75%
    uint256 public constant LTV_PRECISION = 10000;
    uint256 public constant MIN_HEALTH_FACTOR = 1.15e18;
    uint256 public constant MIN_SAFE_HEALTH_FACTOR = 1e18;  // Minimum HF to prevent liquidation
    uint256 public constant INTEREST_RATE_MODE = 2;  // Variable rate
    uint256 public constant WITHDRAWAL_SLIPPAGE_TOLERANCE = 200;  // 2% tolerance for withdrawals
    uint256 public constant BORROW_SAFETY_BUFFER = 200;  // 2% safety buffer on borrows to prevent HF issues
    uint256 public constant DEBT_REPAY_BUFFER = 300;  // 3% buffer for debt repayment to account for interest accrual
    uint256 public constant FEE_PRECISION = 10000;  // Used for slippage tolerance calculations

    mapping(address => uint256) public shares;
    uint256 public totalShares;
    uint256 public totalDeposited;
    uint256 public totalWithdrawn;

    // Events
    event Deposited(address indexed user, uint256 assets, uint256 shares);
    event Withdrawn(address indexed user, uint256 assets, uint256 shares);
    event Rebalanced(uint256 newLTV, uint256 healthFactor);
    event EmergencyExit(uint256 timestamp);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TargetLTVUpdated(uint256 newTargetLTV);
    event MaxLTVUpdated(uint256 newMaxLTV);

    constructor(
        address _pool,
        address _depositAsset,
        address _borrowAsset,
        address _hyToken
    ) {
        require(_pool != address(0), "Pool cannot be zero address");
        require(_depositAsset != address(0), "Deposit asset cannot be zero address");
        require(_borrowAsset != address(0), "Borrow asset cannot be zero address");

        pool = IPool(_pool);
        depositAsset = IERC20(_depositAsset);
        borrowAsset = IERC20(_borrowAsset);
        hyToken = _hyToken;
        owner = msg.sender;
        _status = _NOT_ENTERED;

        // Approve pool for maximum amount
        _safeApprove(depositAsset, _pool, type(uint256).max);
        _safeApprove(borrowAsset, _pool, type(uint256).max);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ========================================
    // DEPOSIT FUNCTIONS
    // ========================================

    /**
     * @notice Deposit assets and receive vault shares
     * @param assets Amount of assets to deposit
     * @return userShares Amount of shares minted
     */
    function deposit(uint256 assets) external nonReentrant returns (uint256 userShares) {
        require(assets > 0, "Cannot deposit 0");

        // Transfer assets from user
        _safeTransferFrom(depositAsset, msg.sender, address(this), assets);

        // Execute leveraged strategy first
        _executeStrategy(assets);

        // Validate that final health factor is safe (>= 1.0)
        (, , , , , uint256 finalHF) = pool.getUserAccountData(address(this));
        require(finalHF >= MIN_SAFE_HEALTH_FACTOR, "Health factor would be < 1");

        // Calculate shares to mint AFTER strategy execution
        userShares = convertToShares(assets);
        require(userShares > 0, "Zero shares");

        // Mint shares
        shares[msg.sender] += userShares;
        totalShares += userShares;
        totalDeposited += assets;

        emit Deposited(msg.sender, assets, userShares);
    }

    // ========================================
    // WITHDRAWAL FUNCTIONS
    // ========================================

    /**
     * @notice Withdraw assets by burning shares
     * @param userShares Amount of shares to burn
     * @return assets Amount of assets returned
     */
    function withdraw(uint256 userShares) external nonReentrant returns (uint256 assets) {
        require(userShares > 0, "Cannot withdraw 0");
        require(shares[msg.sender] >= userShares, "Insufficient shares");

        // Calculate assets to withdraw (must do before burning shares)
        uint256 expectedAssets = convertToAssets(userShares);

        // Burn shares (CEI pattern)
        shares[msg.sender] -= userShares;
        totalShares -= userShares;

        // Get balance before unwind
        uint256 balanceBefore = depositAsset.balanceOf(address(this));

        // Unwind leveraged position
        _unwindPosition(expectedAssets);

        // Get actual balance after unwind
        uint256 balanceAfter = depositAsset.balanceOf(address(this));
        uint256 actualWithdrawn = balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0;

        // Use actual withdrawn amount, but apply slippage tolerance
        uint256 minAcceptable = (expectedAssets * (FEE_PRECISION - WITHDRAWAL_SLIPPAGE_TOLERANCE)) / FEE_PRECISION;
        
        if (actualWithdrawn >= minAcceptable) {
            assets = actualWithdrawn < expectedAssets ? actualWithdrawn : expectedAssets;
        } else if (actualWithdrawn > 0) {
            // Accept less than minimum if that's all we got (due to slippage)
            assets = actualWithdrawn;
        } else {
            // If nothing was withdrawn, revert
            revert("Withdrawal failed - insufficient liquidity");
        }

        // Transfer assets to user
        if (assets > 0) {
            _safeTransfer(depositAsset, msg.sender, assets);
            totalWithdrawn += assets;
        }

        emit Withdrawn(msg.sender, assets, userShares);
    }

    /**
     * @notice Withdraw all shares (full exit)
     * @return assets Amount of assets returned
     */
    function withdrawAll() external nonReentrant returns (uint256 assets) {
        uint256 userShares = shares[msg.sender];
        require(userShares > 0, "No shares to withdraw");
        
        // Calculate assets to withdraw (must do before burning shares)
        uint256 expectedAssets = convertToAssets(userShares);
        
        // Burn shares (CEI pattern)
        shares[msg.sender] = 0;
        totalShares -= userShares;
        
        // Get balance before unwind
        uint256 balanceBefore = depositAsset.balanceOf(address(this));
        
        // Unwind leveraged position
        _unwindPosition(expectedAssets);
        
        // Get actual balance after unwind
        uint256 balanceAfter = depositAsset.balanceOf(address(this));
        uint256 actualWithdrawn = balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0;

        // Use actual withdrawn amount, but apply slippage tolerance
        uint256 minAcceptable = (expectedAssets * (FEE_PRECISION - WITHDRAWAL_SLIPPAGE_TOLERANCE)) / FEE_PRECISION;
        
        if (actualWithdrawn >= minAcceptable) {
            assets = actualWithdrawn < expectedAssets ? actualWithdrawn : expectedAssets;
        } else if (actualWithdrawn > 0) {
            // Accept less than minimum if that's all we got (due to slippage)
            assets = actualWithdrawn;
        } else {
            // If nothing was withdrawn, try progressively smaller amounts
            (uint256 availableCollateral, uint256 currentDebt, , , , ) = pool.getUserAccountData(address(this));
            uint256 netAvailable = availableCollateral > currentDebt ? availableCollateral - currentDebt : 0;
            
            if (netAvailable > 0) {
                // Try progressively smaller amounts: 100%, 95%, 90%, 80%, 50%, 25%, 10%, 5%, 1%
                uint256[] memory fallbackAmounts = new uint256[](9);
                fallbackAmounts[0] = netAvailable;
                fallbackAmounts[1] = (netAvailable * 95) / 100;
                fallbackAmounts[2] = (netAvailable * 90) / 100;
                fallbackAmounts[3] = (netAvailable * 80) / 100;
                fallbackAmounts[4] = (netAvailable * 50) / 100;
                fallbackAmounts[5] = (netAvailable * 25) / 100;
                fallbackAmounts[6] = (netAvailable * 10) / 100;
                fallbackAmounts[7] = (netAvailable * 5) / 100;
                fallbackAmounts[8] = (netAvailable * 1) / 100;
                
                for (uint256 i = 0; i < fallbackAmounts.length; i++) {
                    if (fallbackAmounts[i] == 0) continue;
                    
                    try pool.withdraw(address(depositAsset), fallbackAmounts[i], address(this)) returns (uint256 amount) {
                        if (amount > 0) {
                            actualWithdrawn = amount;
                            assets = amount;
                            break; // Success, exit loop
                        }
                    } catch {
                        continue; // Try next amount
                    }
                }
                
                if (actualWithdrawn == 0) {
                    revert("Withdrawal failed - insufficient liquidity");
                }
            } else {
                revert("Withdrawal failed - insufficient liquidity");
            }
        }
        
        // Transfer assets to user
        if (assets > 0) {
            _safeTransfer(depositAsset, msg.sender, assets);
            totalWithdrawn += assets;
        }
        
        emit Withdrawn(msg.sender, assets, userShares);
    }

    /**
     * @notice Preview withdrawal amount
     * @param userShares Amount of shares to withdraw
     * @return assets Amount of assets you'd receive
     */
    function previewWithdraw(uint256 userShares) external view returns (uint256 assets) {
        return convertToAssets(userShares);
    }

    // ========================================
    // VIEW FUNCTIONS - USER POSITION
    // ========================================

    /**
     * @notice Get complete user position details
     * @param user Address of the user
     * @return position UserPosition struct with all details
     */
    function getUserPosition(address user) external view returns (UserPosition memory position) {
        uint256 userShares = shares[user];
        
        if (userShares == 0) {
            return UserPosition(0, 0, 0, 0, 0, 0, 0, 0);
        }

        // Get vault-wide data
        (uint256 totalCollateral, uint256 totalDebt, , , uint256 vaultLTV, uint256 vaultHF) = 
            pool.getUserAccountData(address(this));

        // Calculate user's share of vault
        uint256 userProportion = totalShares > 0 ? (userShares * 1e18) / totalShares : 0;

        // User's underlying assets
        uint256 underlyingAssets = convertToAssets(userShares);

        // User's proportional collateral and debt
        uint256 userCollateral = (totalCollateral * userProportion) / 1e18;
        uint256 userDebt = (totalDebt * userProportion) / 1e18;
        
        // Calculate leverage ratio
        uint256 leverageRatio = userCollateral > userDebt && (userCollateral - userDebt) > 0 ? 
            (userCollateral * LTV_PRECISION) / (userCollateral - userDebt) : 0;

        position = UserPosition({
            shares: userShares,
            underlyingAssets: underlyingAssets,
            collateralValue: userCollateral,
            debtValue: userDebt,
            netValue: underlyingAssets,
            healthFactor: vaultHF,
            currentLTV: vaultLTV,
            leverageRatio: leverageRatio
        });
    }

    /**
     * @notice Get vault-wide statistics
     * @return stats VaultStats struct with all vault data
     */
    function getVaultStats() external view returns (VaultStats memory stats) {
        (uint256 totalCollateral, uint256 totalDebt, , , , uint256 hf) = 
            pool.getUserAccountData(address(this));

        uint256 netAPY = _calculateNetAPY();

        stats = VaultStats({
            totalShares: totalShares,
            totalAssets: _totalAssets(),
            totalCollateral: totalCollateral,
            totalDebt: totalDebt,
            currentAPY: netAPY,
            healthFactor: hf,
            collateralAsset: address(depositAsset),
            borrowAsset: address(borrowAsset)
        });
    }

    /**
     * @notice Get current health factor
     * @return Current health factor (1e18 = 1.0)
     */
    function healthFactor() public view returns (uint256) {
        (, , , , , uint256 hf) = pool.getUserAccountData(address(this));
        return hf;
    }

    /**
     * @notice Get current LTV ratio
     * @return ltv Current loan-to-value ratio (10000 = 100%)
     */
    function currentLTV() external view returns (uint256 ltv) {
        (, , , , ltv, ) = pool.getUserAccountData(address(this));
    }

    function getUserShares(address user) external view returns (uint256) {
        return shares[user];
    }

    function getUserAssets(address user) external view returns (uint256) {
        return convertToAssets(shares[user]);
    }

    function getTVL() external view returns (uint256) {
        return _totalAssets();
    }

    // ========================================
    // CONVERSION FUNCTIONS (ERC4626-style)
    // ========================================

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 supply = totalShares;
        return supply == 0 ? assets : (assets * supply) / _totalAssets();
    }

    function convertToAssets(uint256 userShares) public view returns (uint256) {
        uint256 supply = totalShares;
        return supply == 0 ? 0 : (userShares * _totalAssets()) / supply;
    }

    // ========================================
    // INTERNAL STRATEGY FUNCTIONS
    // ========================================

    function _executeStrategy(uint256 initialAmount) internal {
        // If initialAmount is 0, we're just leveraging existing collateral (for rebalance)
        if (initialAmount > 0) {
            // 1. Supply collateral to HypurrFi
            pool.supply(address(depositAsset), initialAmount, address(this), 0);
            
            // 2. Enable as collateral
            pool.setUserUseReserveAsCollateral(address(depositAsset), true);
        }

        // 3. Leverage loop
        uint256 currentSupply = initialAmount;
        uint256 iterations = 0;
        uint256 minBorrowThreshold = initialAmount > 0 ? initialAmount / 100 : 1e6; // Minimum borrow amount

        while (iterations < 10) {
            (, , uint256 availableBorrows, , , uint256 hf) = 
                pool.getUserAccountData(address(this));

            // Check health factor with safety margin
            if (availableBorrows == 0 || hf < (MIN_HEALTH_FACTOR * 110) / 100) break; // 10% safety margin

            // Calculate target borrow with safety buffer
            uint256 targetBorrow = currentSupply > 0 
                ? (currentSupply * targetLTV) / LTV_PRECISION
                : availableBorrows;
            
            // Apply safety buffer to available borrows (use 98% to be safe)
            uint256 safeAvailableBorrows = (availableBorrows * (FEE_PRECISION - BORROW_SAFETY_BUFFER)) / FEE_PRECISION;
            uint256 borrowAmount = targetBorrow < safeAvailableBorrows ? targetBorrow : safeAvailableBorrows;

            if (borrowAmount < minBorrowThreshold) break;

            // Try to borrow with error handling
            try pool.borrow(address(borrowAsset), borrowAmount, INTEREST_RATE_MODE, 0, address(this)) {
                // Re-supply if same asset
                if (address(depositAsset) == address(borrowAsset)) {
                    pool.supply(address(depositAsset), borrowAmount, address(this), 0);
                    currentSupply += borrowAmount;
                } else {
                    break;
                }
            } catch {
                // If borrow fails, try with smaller amount (50% of what we tried)
                uint256 reducedBorrow = borrowAmount / 2;
                if (reducedBorrow >= minBorrowThreshold) {
                    try pool.borrow(address(borrowAsset), reducedBorrow, INTEREST_RATE_MODE, 0, address(this)) {
                        if (address(depositAsset) == address(borrowAsset)) {
                            pool.supply(address(depositAsset), reducedBorrow, address(this), 0);
                            currentSupply += reducedBorrow;
                        } else {
                            break;
                        }
                    } catch {
                        // If even reduced borrow fails, exit loop
                        break;
                    }
                } else {
                    break;
                }
            }

            // Check health factor after borrow to ensure we're still safe
            (, , , , , uint256 newHF) = pool.getUserAccountData(address(this));
            if (newHF < (MIN_HEALTH_FACTOR * 110) / 100) {
                break;
            }

            iterations++;
        }
    }

    function _unwindPosition(uint256 assetsToWithdraw) internal {
        (, uint256 totalDebt, , , , ) = 
            pool.getUserAccountData(address(this));

        if (totalDebt == 0) {
            // No debt, just withdraw with slippage tolerance
            (uint256 availableCollateral, , , , , ) = pool.getUserAccountData(address(this));
            if (availableCollateral == 0) return;
            
            uint256 maxWithdraw = availableCollateral < assetsToWithdraw ? availableCollateral : assetsToWithdraw;
            uint256 minWithdrawNoDebt = (assetsToWithdraw * (FEE_PRECISION - WITHDRAWAL_SLIPPAGE_TOLERANCE)) / FEE_PRECISION;
            
            // Try progressively smaller amounts until something works
            uint256[] memory amountsToTryNoDebt = new uint256[](5);
            amountsToTryNoDebt[0] = maxWithdraw;
            amountsToTryNoDebt[1] = minWithdrawNoDebt < availableCollateral ? minWithdrawNoDebt : availableCollateral;
            amountsToTryNoDebt[2] = (availableCollateral * 95) / 100;
            amountsToTryNoDebt[3] = (availableCollateral * 90) / 100;
            amountsToTryNoDebt[4] = (availableCollateral * 80) / 100;
            
            uint256 withdrawnNoDebt = 0;
            for (uint256 i = 0; i < amountsToTryNoDebt.length; i++) {
                if (amountsToTryNoDebt[i] == 0 || amountsToTryNoDebt[i] > availableCollateral) continue;
                
                try pool.withdraw(address(depositAsset), amountsToTryNoDebt[i], address(this)) returns (uint256 amount) {
                    if (amount > 0) {
                        withdrawnNoDebt = amount;
                        break;
                    }
                } catch {
                    continue;
                }
            }
            
            // If all attempts failed, try with very small amounts
            if (withdrawnNoDebt == 0 && availableCollateral > 0) {
                for (uint256 percent = 10; percent >= 1 && withdrawnNoDebt == 0; percent--) {
                    uint256 smallAmount = (availableCollateral * percent) / 100;
                    if (smallAmount > 0) {
                    try pool.withdraw(address(depositAsset), smallAmount, address(this)) returns (uint256 amount) {
                        if (amount > 0) {
                            withdrawnNoDebt = amount;
                            break;
                        }
                    } catch {
                        continue;
                    }
                    }
                }
            }
            return;
        }

        uint256 totalAssets = _totalAssets();
        if (totalAssets == 0) {
            // If no assets, just try to withdraw what we can
            (uint256 availableCollateral, , , , , ) = pool.getUserAccountData(address(this));
            if (availableCollateral > 0) {
                try pool.withdraw(address(depositAsset), availableCollateral < assetsToWithdraw ? availableCollateral : assetsToWithdraw, address(this)) {} catch {}
            }
            return;
        }
        
        // Calculate proportion with tolerance for rounding
        // Ensure we don't try to withdraw more than available
        if (assetsToWithdraw > totalAssets) {
            assetsToWithdraw = totalAssets;
        }
        uint256 proportion = (assetsToWithdraw * 1e18) / totalAssets;
        uint256 debtToRepay = (totalDebt * proportion) / 1e18;
        
        // Repay proportional debt
        if (debtToRepay > 0 && address(depositAsset) == address(borrowAsset)) {
            // Same asset: withdraw collateral to repay debt
            // Get current debt again (may have increased due to interest)
            (, uint256 currentDebt, , , , ) = pool.getUserAccountData(address(this));
            uint256 actualDebtToRepay = (currentDebt * proportion) / 1e18;
            
            // Use the larger of calculated or actual proportional debt (with buffer)
            uint256 repayAmount = actualDebtToRepay > debtToRepay ? actualDebtToRepay : debtToRepay;
            repayAmount = repayAmount + (repayAmount * DEBT_REPAY_BUFFER) / FEE_PRECISION; // Add buffer for interest accrual
            
            // Cap at available collateral
            (uint256 availableCollateral, , , , , ) = pool.getUserAccountData(address(this));
            if (repayAmount > availableCollateral) {
                repayAmount = availableCollateral;
            }
            
            if (repayAmount > 0) {
                // Withdraw with slippage tolerance
                uint256 minWithdrawForRepay = (repayAmount * (FEE_PRECISION - WITHDRAWAL_SLIPPAGE_TOLERANCE)) / FEE_PRECISION;
                uint256 withdrawForRepay = repayAmount < availableCollateral ? repayAmount : availableCollateral;
                
                try pool.withdraw(address(depositAsset), withdrawForRepay, address(this)) {
                // Repay what we can (may be less than requested due to interest)
                    uint256 actualBalance = depositAsset.balanceOf(address(this));
                    if (actualBalance > 0) {
                        pool.repay(address(borrowAsset), actualBalance, INTEREST_RATE_MODE, address(this));
                    }
                } catch {
                    // Try with minimum acceptable amount
                    if (availableCollateral >= minWithdrawForRepay) {
                        try pool.withdraw(address(depositAsset), minWithdrawForRepay, address(this)) {
                            uint256 actualBalance = depositAsset.balanceOf(address(this));
                            if (actualBalance > 0) {
                                pool.repay(address(borrowAsset), actualBalance, INTEREST_RATE_MODE, address(this));
                            }
                        } catch {}
                    }
                }
            }
        } else if (debtToRepay > 0) {
            // Different assets: repay from existing balance
            uint256 balance = borrowAsset.balanceOf(address(this));
            if (balance > 0) {
                uint256 repayAmount = debtToRepay < balance ? debtToRepay : balance;
                pool.repay(address(borrowAsset), repayAmount, INTEREST_RATE_MODE, address(this));
            }
        }
        
        // Now withdraw the requested amount (with tolerance for rounding)
        // Get the actual aToken balance instead of calculating from base units
        // This is more accurate as it reflects what's actually withdrawable
        (uint256 configuration, uint128 liquidityIndex, , , , , , uint16 id, address aTokenAddress, , , , , , ) = 
            pool.getReserveData(address(depositAsset));
        
        // Get actual aToken balance
        uint256 aTokenBalance = IERC20(aTokenAddress).balanceOf(address(this));
        
        // Calculate what we can actually withdraw after debt repayment
        (uint256 finalCollateral, uint256 finalDebt, , , , ) = pool.getUserAccountData(address(this));
        uint256 netValueBase = finalCollateral > finalDebt ? finalCollateral - finalDebt : 0;
        
        // Use the minimum of aToken balance and calculated net value (in token units)
        // Convert base units to token units by dividing by price (approximate)
        // But actually, aToken balance is already in token units, so use that
        uint256 availableToWithdraw = aTokenBalance;
        
        // Cap at the requested amount
        if (availableToWithdraw > assetsToWithdraw) {
            availableToWithdraw = assetsToWithdraw;
        }
        
        if (availableToWithdraw == 0) {
            // Nothing to withdraw after debt repayment
            return;
        }
        
        // Apply slippage tolerance - allow withdrawing slightly less if needed
        uint256 minWithdraw = (assetsToWithdraw * (FEE_PRECISION - WITHDRAWAL_SLIPPAGE_TOLERANCE)) / FEE_PRECISION;
        
        // Start with the requested amount, but cap at available
        uint256 targetAmount = assetsToWithdraw < availableToWithdraw ? assetsToWithdraw : availableToWithdraw;
        
        // Try progressively smaller amounts until something works
        // This handles cases where the pool has liquidity constraints
        uint256[] memory amountsToTry = new uint256[](5);
        amountsToTry[0] = targetAmount;
        amountsToTry[1] = minWithdraw < availableToWithdraw ? minWithdraw : availableToWithdraw;
        amountsToTry[2] = (availableToWithdraw * 95) / 100; // 95% of available
        amountsToTry[3] = (availableToWithdraw * 90) / 100; // 90% of available
        amountsToTry[4] = (availableToWithdraw * 80) / 100; // 80% of available
        
        uint256 withdrawn = 0;
        for (uint256 i = 0; i < amountsToTry.length; i++) {
            if (amountsToTry[i] == 0 || amountsToTry[i] > availableToWithdraw) continue;
            
            try pool.withdraw(address(depositAsset), amountsToTry[i], address(this)) returns (uint256 amount) {
                if (amount > 0) {
                    withdrawn = amount;
                    break; // Success, exit loop
                }
            } catch {
                continue; // Try next amount
            }
        }
        
        // If all attempts failed, try with very small amounts as last resort
        if (withdrawn == 0 && availableToWithdraw > 0) {
            // Try 1% increments from 1% to 10%
            for (uint256 percent = 10; percent >= 1 && withdrawn == 0; percent--) {
                uint256 smallAmount = (availableToWithdraw * percent) / 100;
                if (smallAmount > 0) {
                    try pool.withdraw(address(depositAsset), smallAmount, address(this)) returns (uint256 amount) {
                        if (amount > 0) {
                            withdrawn = amount;
                            break;
                        }
                    } catch {
                        continue;
                    }
                }
            }
        }
    }

    function _totalAssets() internal view returns (uint256) {
        (uint256 totalCollateral, uint256 totalDebt, , , , ) = 
            pool.getUserAccountData(address(this));
        return totalCollateral > totalDebt ? totalCollateral - totalDebt : 0;
    }

    function _calculateNetAPY() internal view returns (uint256) {
        (, , uint128 supplyRate, , uint128 borrowRate, , , , , , , , , , ) = 
            pool.getReserveData(address(depositAsset));

        (uint256 totalCollateral, uint256 totalDebt, , , , ) = 
            pool.getUserAccountData(address(this));

        if (totalCollateral == 0 || totalCollateral <= totalDebt) return 0;

        uint256 leverage = (totalCollateral * LTV_PRECISION) / (totalCollateral - totalDebt);
        uint256 leveragedSupply = (uint256(supplyRate) * leverage) / LTV_PRECISION;
        uint256 borrowCost = (uint256(borrowRate) * (leverage - LTV_PRECISION)) / LTV_PRECISION;

        return leveragedSupply > borrowCost ? leveragedSupply - borrowCost : 0;
    }

    // ========================================
    // REBALANCING
    // ========================================

    function rebalance() external onlyOwner {
        (uint256 totalCollateral, uint256 totalDebt, , , uint256 currentLTV_, uint256 hf) = 
            pool.getUserAccountData(address(this));

        require(
            hf < MIN_HEALTH_FACTOR || 
            currentLTV_ > maxLTV || 
            currentLTV_ < (targetLTV * 95) / 100,
            "Position healthy"
        );

        if (currentLTV_ > maxLTV) {
            // Reduce LTV by repaying debt
            uint256 targetDebt = (totalCollateral * targetLTV) / LTV_PRECISION;
            uint256 excessDebt = totalDebt > targetDebt ? totalDebt - targetDebt : 0;
            
            if (excessDebt > 0 && address(depositAsset) == address(borrowAsset)) {
                pool.withdraw(address(depositAsset), excessDebt, address(this));
                pool.repay(address(borrowAsset), excessDebt, INTEREST_RATE_MODE, address(this));
            }
        } else if (currentLTV_ < (targetLTV * 95) / 100 && hf >= MIN_HEALTH_FACTOR) {
            // Increase LTV by borrowing more
            // This is only safe if health factor is good
            _executeStrategy(0); // Pass 0 to just leverage existing collateral
        }
        // If HF < MIN_HEALTH_FACTOR, we need to reduce debt
        else if (hf < MIN_HEALTH_FACTOR) {
            // Reduce debt to improve health factor
            uint256 targetDebt = (totalCollateral * targetLTV) / LTV_PRECISION;
            uint256 excessDebt = totalDebt > targetDebt ? totalDebt - targetDebt : 0;
            
            if (excessDebt > 0 && address(depositAsset) == address(borrowAsset)) {
                pool.withdraw(address(depositAsset), excessDebt, address(this));
                pool.repay(address(borrowAsset), excessDebt, INTEREST_RATE_MODE, address(this));
            }
        }

        // Validate that rebalancing didn't push HF below 1.0
        (, , , , uint256 finalLTV, uint256 finalHF) = pool.getUserAccountData(address(this));
        require(finalHF >= MIN_SAFE_HEALTH_FACTOR, "Rebalance would result in HF < 1");

        emit Rebalanced(finalLTV, finalHF);
    }

    function emergencyExit() external onlyOwner {
        (, , , , , uint256 hf) = pool.getUserAccountData(address(this));
        require(hf < 1.05e18, "Not an emergency");
        
        _unwindPosition(_totalAssets());
        emit EmergencyExit(block.timestamp);
    }

    // ========================================
    // ADMIN FUNCTIONS
    // ========================================

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner cannot be zero address");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function setTargetLTV(uint256 newTargetLTV) external onlyOwner {
        require(newTargetLTV < maxLTV, "Target LTV must be < max LTV");
        require(newTargetLTV > 0, "Target LTV must be > 0");
        targetLTV = newTargetLTV;
        emit TargetLTVUpdated(newTargetLTV);
    }

    function setMaxLTV(uint256 newMaxLTV) external onlyOwner {
        require(newMaxLTV > targetLTV, "Max LTV must be > target LTV");
        require(newMaxLTV < LTV_PRECISION, "Max LTV must be < 100%");
        maxLTV = newMaxLTV;
        emit MaxLTVUpdated(newMaxLTV);
    }

    // ========================================
    // SAFE TRANSFER HELPERS
    // ========================================

    function _safeTransfer(IERC20 token, address to, uint256 value) private {
        // Check if address is a contract
        uint256 size;
        assembly {
            size := extcodesize(token)
        }
        require(size > 0, "Token is not a contract");
        
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, value)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Transfer failed");
    }

    function _safeTransferFrom(IERC20 token, address from, address to, uint256 value) private {
        // Check if address is a contract
        uint256 size;
        assembly {
            size := extcodesize(token)
        }
        require(size > 0, "Token is not a contract");
        
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, value)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferFrom failed");
    }

    function _safeApprove(IERC20 token, address spender, uint256 value) private {
        // Check if address is a contract
        uint256 size;
        assembly {
            size := extcodesize(token)
        }
        require(size > 0, "Token is not a contract");
        
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.approve.selector, spender, value)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Approve failed");
    }
}
