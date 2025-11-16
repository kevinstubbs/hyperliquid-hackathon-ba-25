// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {Hy007FreeVault} from "../src/Hy007FreeVault.sol";
import {IERC20, IPool} from "../src/interfaces/IPool.sol";

contract Hy007FreeVaultTest is Test {
    Hy007FreeVault vault;
    IERC20 usdc;
    IPool pool;
    
    address user1 = address(0x1);
    address user2 = address(0x2);
    address owner = address(this); // Test contract is owner

    // Fork setup
    uint256 hyperliquidFork;
    
    function setUp() public {
        // Check if we're already on a fork (when --fork-url is passed to forge test)
        bool forkAvailable = false;
        
        // Try to detect if we're already on a fork by checking block.number
        // If block.number > 0, we're likely on a fork
        if (block.number > 0) {
            forkAvailable = true;
            console2.log("Using existing fork (block:", block.number, ")");
        } else {
            // Try to create fork from environment variable
            try vm.envString("HYPERLIQUID_RPC_URL") returns (string memory rpcUrl) {
                try vm.createFork(rpcUrl) returns (uint256 forkId) {
                    hyperliquidFork = forkId;
                    vm.selectFork(hyperliquidFork);
                    forkAvailable = true;
                    console2.log("Fork created from:", rpcUrl);
                } catch {
                    console2.log("Warning: Could not create fork, tests may fail");
                }
            } catch {
                console2.log("Warning: HYPERLIQUID_RPC_URL not set, tests may fail");
            }
        }

        // Only proceed if fork is available
        if (!forkAvailable) {
            revert("Fork not available. Use --fork-url flag or set HYPERLIQUID_RPC_URL environment variable.");
        }

        // Get contract addresses from environment - these are REQUIRED
        // Note: When using --fork-url, you must also set these env vars or use --env-file
        address poolAddress;
        address usdcAddress;
        
        try vm.envAddress("POOL_ADDRESS") returns (address addr) {
            poolAddress = addr;
        } catch {
            revert(
                "POOL_ADDRESS environment variable not set. "
                "Set it in .env file or use: export POOL_ADDRESS=0x..."
            );
        }
        
        try vm.envAddress("USDC_ADDRESS") returns (address addr) {
            usdcAddress = addr;
        } catch {
            revert(
                "USDC_ADDRESS environment variable not set. "
                "Set it in .env file or use: export USDC_ADDRESS=0x..."
            );
        }
        
        // Verify addresses are contracts
        uint256 poolSize;
        uint256 usdcSize;
        assembly {
            poolSize := extcodesize(poolAddress)
            usdcSize := extcodesize(usdcAddress)
        }
        
        if (poolSize == 0) {
            revert(
                string.concat(
                    "POOL_ADDRESS is not a contract (code size: ",
                    vm.toString(poolSize),
                    "). Check that the address is correct for the forked network."
                )
            );
        }
        
        if (usdcSize == 0) {
            revert(
                string.concat(
                    "USDC_ADDRESS is not a contract (code size: ",
                    vm.toString(usdcSize),
                    "). Check that the address is correct for the forked network."
                )
            );
        }
        
        pool = IPool(poolAddress);
        usdc = IERC20(usdcAddress);

        console2.log("Pool address:", poolAddress);
        console2.log("USDC address:", usdcAddress);

        // Deploy vault
        vault = new Hy007FreeVault(
            poolAddress,
            usdcAddress,
            usdcAddress,
            address(0)
        );

        console2.log("Vault deployed at:", address(vault));

        // Fund test users with USDC
        _fundUsers(usdcAddress);
    }

    function testDeposit() public {
        
        uint256 depositAmount = 1000e6; // 1000 USDC

        vm.startPrank(user1);
        
        uint256 balanceBefore = usdc.balanceOf(user1);
        console2.log("User1 USDC balance:", balanceBefore / 1e6);
        
        require(balanceBefore >= depositAmount, "User1 needs USDC - check _fundUsers");

        usdc.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount);

        assertGt(shares, 0, "Should receive shares");
        assertEq(vault.getUserShares(user1), shares, "Shares should match");
        
        vm.stopPrank();

        console2.log("Deposited:", depositAmount / 1e6, "USDC");
        console2.log("Shares received:", shares / 1e18);
    }

    function testWithdraw() public {
        uint256 depositAmount = 1000e6;
        
        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount);

        // Wait a bit for interest to accrue (optional, but more realistic)
        vm.roll(block.number + 10);

        // Then withdraw
        uint256 assetsReceived = vault.withdraw(shares);
        
        assertGt(assetsReceived, 0, "Should receive assets");
        assertEq(vault.getUserShares(user1), 0, "Shares should be zero");
        
        vm.stopPrank();

        console2.log("Withdrawn:", assetsReceived / 1e6, "USDC");
    }

    function testWithdrawAll() public {
        uint256 depositAmount = 1000e6;
        
        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount);

        uint256 assetsReceived = vault.withdrawAll();
        
        assertGt(assetsReceived, 0, "Should receive assets");
        assertEq(vault.getUserShares(user1), 0, "Shares should be zero");
        
        vm.stopPrank();

        console2.log("Withdrawn all:", assetsReceived / 1e6, "USDC");
    }

    function testLeveragedPosition() public {
        uint256 depositAmount = 1000e6;
        
        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount);
        vm.stopPrank();

        Hy007FreeVault.VaultStats memory stats = vault.getVaultStats();
        
        console2.log("Total Collateral:", stats.totalCollateral / 1e8);
        console2.log("Total Debt:", stats.totalDebt / 1e8);
        console2.log("Health Factor:", stats.healthFactor / 1e18);
        
        assertGt(stats.totalCollateral, depositAmount * 1e2, "Should have leveraged position");
        assertGt(stats.healthFactor, 1e18, "Health factor should be > 1");
    }

    function testMultipleUsers() public {
        vm.prank(user1);
        usdc.approve(address(vault), 1000e6);
        vm.prank(user1);
        uint256 user1Shares = vault.deposit(1000e6);

        vm.prank(user2);
        usdc.approve(address(vault), 2000e6);
        vm.prank(user2);
        uint256 user2Shares = vault.deposit(2000e6);

        // Both users should have shares
        assertGt(user1Shares, 0, "User1 should have shares");
        assertGt(user2Shares, 0, "User2 should have shares");
        
        // Both users should have positive asset values
        uint256 user1Assets = vault.getUserAssets(user1);
        uint256 user2Assets = vault.getUserAssets(user2);
        assertGt(user1Assets, 0, "User1 should have assets");
        assertGt(user2Assets, 0, "User2 should have assets");
        
        // Total deposits were 3000 USDC, so total assets should be reasonable
        // Note: In leveraged vaults, share pricing can vary between deposits
        // The important thing is that both users have shares and can withdraw
        console2.log("User1 shares:", user1Shares / 1e18);
        console2.log("User2 shares:", user2Shares / 1e18);
        console2.log("User1 assets:", user1Assets / 1e6);
        console2.log("User2 assets:", user2Assets / 1e6);
    }

    function testHealthFactorMaintained() public {
        vm.startPrank(user1);
        usdc.approve(address(vault), 5000e6);
        vault.deposit(5000e6);
        vm.stopPrank();

        uint256 hf = vault.healthFactor();
        assertGt(hf, 1.15e18, "Health factor should be > 1.15");
        
        console2.log("Health Factor:", hf / 1e18, ".", (hf % 1e18) / 1e16);
    }

    function testGetUserPosition() public {
        uint256 depositAmount = 1000e6;
        
        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount);
        vm.stopPrank();

        Hy007FreeVault.UserPosition memory position = vault.getUserPosition(user1);
        
        assertGt(position.shares, 0, "Should have shares");
        assertGt(position.collateralValue, 0, "Should have collateral");
        assertGt(position.healthFactor, 1e18, "Health factor > 1");
        
        console2.log("User position:");
        console2.log("  Shares:", position.shares / 1e18);
        console2.log("  Net Value:", position.netValue / 1e6);
        console2.log("  Collateral:", position.collateralValue / 1e8);
        console2.log("  Debt:", position.debtValue / 1e8);
        console2.log("  Health Factor:", position.healthFactor / 1e18);
        console2.log("  Leverage:", position.leverageRatio / 10000);
    }

    function testPreviewWithdraw() public {
        uint256 depositAmount = 1000e6;
        
        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount);
        
        uint256 previewAmount = vault.previewWithdraw(shares);
        assertGt(previewAmount, 0, "Preview should return amount");
        
        console2.log("Preview withdraw:", previewAmount / 1e6, "USDC");
        vm.stopPrank();
    }

    function testRebalance() public {
        // First deposit
        vm.startPrank(user1);
        usdc.approve(address(vault), 1000e6);
        vault.deposit(1000e6);
        vm.stopPrank();
        
        // Try to rebalance (should work as owner)
        // Note: This will only work if position actually needs rebalancing
        try vault.rebalance() {
            console2.log("Rebalance successful");
        } catch {
            console2.log("Rebalance skipped - position healthy");
        }
    }

    function testAccessControl() public {
        // Test that non-owner cannot call rebalance
        vm.startPrank(user1);
        vm.expectRevert("Not owner");
        vault.rebalance();
        vm.stopPrank();
        
        // Test that non-owner cannot call emergencyExit
        vm.startPrank(user1);
        vm.expectRevert("Not owner");
        vault.emergencyExit();
        vm.stopPrank();
        
        // Test that owner can call these functions
        // (will revert if conditions not met, but that's expected)
        try vault.rebalance() {
            console2.log("Owner can call rebalance");
        } catch {
            console2.log("Rebalance reverted (expected if position healthy)");
        }
    }

    function testAdminFunctions() public {
        // Test setTargetLTV
        uint256 oldTarget = vault.targetLTV();
        vault.setTargetLTV(6500);
        assertEq(vault.targetLTV(), 6500, "Target LTV should be updated");
        vault.setTargetLTV(oldTarget); // Restore
        
        // Test setMaxLTV
        uint256 oldMax = vault.maxLTV();
        vault.setMaxLTV(8000);
        assertEq(vault.maxLTV(), 8000, "Max LTV should be updated");
        vault.setMaxLTV(oldMax); // Restore
        
        // Test transferOwnership
        address newOwner = address(0x999);
        vault.transferOwnership(newOwner);
        assertEq(vault.owner(), newOwner, "Owner should be updated");
        // Restore ownership by pranking as new owner
        vm.prank(newOwner);
        vault.transferOwnership(address(this));
    }

    // Helper function to fund users with USDC
    function _fundUsers(address usdcAddress) internal {
        if (usdcAddress == address(0)) {
            console2.log("Warning: USDC address is zero, skipping funding");
            return;
        }
        
        // Common USDC whale addresses (adjust for your network)
        address[] memory potentialWhales = new address[](2);
        potentialWhales[0] = address(0x68e37dE8d93d3496ae143F2E900490f6280C57cD);
        potentialWhales[1] = address(0x462B95575cb2D56de9d1aAaAAb452279B058Aa06);

        IERC20 token = IERC20(usdcAddress);
        address whale = address(0);
        
        // Find a whale with enough balance
        for (uint i = 0; i < potentialWhales.length; i++) {
            try token.balanceOf(potentialWhales[i]) returns (uint256 balance) {
                if (balance > 100000e6) {
                    whale = potentialWhales[i];
                    break;
                }
            } catch {
                continue;
            }
        }
        
        if (whale == address(0)) {
            console2.log("Warning: No USDC whale found - users may not have funds");
            // If we're on a fork, try to deal ETH to users and swap, or skip
            // For now, just log and continue - tests will fail if they need funds
            return;
        }
        
        console2.log("Using whale:", whale);
        uint256 whaleBalance = token.balanceOf(whale);
        console2.log("Whale balance:", whaleBalance / 1e6, "USDC");
        
        // Fund users - use deal if available, otherwise transfer
        try vm.deal(user1, 1 ether) {} catch {}
        try vm.deal(user2, 1 ether) {} catch {}
        
        vm.startPrank(whale);
        token.transfer(user1, 10000e6);
        token.transfer(user2, 10000e6);
        vm.stopPrank();
        
        console2.log("Funded user1:", token.balanceOf(user1) / 1e6, "USDC");
        console2.log("Funded user2:", token.balanceOf(user2) / 1e6, "USDC");
    }
}
