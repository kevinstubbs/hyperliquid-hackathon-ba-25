// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {HypurrFiVault} from "../src/HypurrFiVault.sol";
import {IERC20, IPool} from "../src/interfaces/IPool.sol";

contract FullFlowScript is Script {
    function run() external {
        // Load environment variables
        address poolAddress = vm.envAddress("POOL_ADDRESS");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        
        // Get the first test account (anvil's first account)
        address user = msg.sender; // First anvil account (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)
        address treasury = vm.addr(1); // Second anvil account as treasury
        
        console2.log("============================================================");
        console2.log("Full Flow Test Script");
        console2.log("============================================================");
        console2.log("User:", user);
        console2.log("Pool Address:", poolAddress);
        console2.log("USDC Address:", usdcAddress);
        console2.log("");
        
        vm.startBroadcast();
        
        // Step 1: Fund user with USDC
        console2.log("STEP 1: Funding user with USDC");
        console2.log("------------------------------------------------------------");
        _fundUser(usdcAddress, user, 100e6); // 100 USDC
        IERC20 usdc = IERC20(usdcAddress);
        console2.log("User USDC balance:", usdc.balanceOf(user) / 1e6, "USDC");
        console2.log("");
        
        // Step 2: Deploy vault
        console2.log("STEP 2: Deploying HypurrFiVault");
        console2.log("------------------------------------------------------------");
        HypurrFiVault vault = new HypurrFiVault(
            poolAddress,
            usdcAddress,
            usdcAddress,
            address(0),
            treasury
        );
        console2.log("Vault deployed at:", address(vault));
        console2.log("");
        
        // Step 3: Stake (deposit)
        console2.log("STEP 3: Staking (depositing)");
        console2.log("------------------------------------------------------------");
        uint256 depositAmount = 100e6; // 100 USDC
        vm.stopBroadcast();
        vm.startBroadcast(user);
        usdc.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount);
        vm.stopBroadcast();
        vm.startBroadcast();
        
        console2.log("Deposited:", depositAmount / 1e6, "USDC");
        console2.log("Received shares:", shares / 1e18);
        
        // Show position
        HypurrFiVault.UserPosition memory position1 = vault.getUserPosition(user);
        console2.log("User shares:", position1.shares / 1e18);
        console2.log("Net value: $", position1.netValue / 1e6);
        console2.log("Health factor:", position1.healthFactor / 1e18);
        console2.log("Leverage:", position1.leverageRatio / 10000, "x");
        console2.log("");
        
        // Step 4: Run forward in time (1 day)
        console2.log("STEP 4: Running forward in time (1 day)");
        console2.log("------------------------------------------------------------");
        uint256 currentTime = block.timestamp;
        uint256 oneDay = 86400;
        vm.warp(currentTime + oneDay);
        console2.log("Time advanced by 1 day");
        console2.log("New timestamp:", block.timestamp);
        
        // Show updated position
        HypurrFiVault.UserPosition memory position2 = vault.getUserPosition(user);
        console2.log("User shares:", position2.shares / 1e18);
        console2.log("Net value: $", position2.netValue / 1e6);
        console2.log("Health factor:", position2.healthFactor / 1e18);
        console2.log("");
        
        // Step 5: Rebalance
        console2.log("STEP 5: Rebalancing");
        console2.log("------------------------------------------------------------");
        
        // Check if rebalance is needed
        HypurrFiVault.VaultStats memory statsBefore = vault.getVaultStats();
        uint256 currentLTV = vault.currentLTV();
        console2.log("Current LTV:", currentLTV / 100, "%");
        console2.log("Health factor before:", statsBefore.healthFactor / 1e18);
        
        // Try to rebalance (may revert if position is healthy)
        try vault.rebalance() {
            console2.log("Rebalance executed successfully");
        } catch {
            console2.log("Rebalance skipped - position is healthy");
        }
        
        HypurrFiVault.VaultStats memory stats1 = vault.getVaultStats();
        console2.log("Vault health factor:", stats1.healthFactor / 1e18);
        console2.log("Total collateral: $", stats1.totalCollateral / 1e8);
        console2.log("Total debt: $", stats1.totalDebt / 1e8);
        
        HypurrFiVault.UserPosition memory position3 = vault.getUserPosition(user);
        console2.log("User net value after rebalance: $", position3.netValue / 1e6);
        console2.log("");
        
        // Step 6: Run forward in time again (1 more day)
        console2.log("STEP 6: Running forward in time again (1 more day)");
        console2.log("------------------------------------------------------------");
        vm.warp(block.timestamp + oneDay);
        console2.log("Time advanced by another day");
        console2.log("New timestamp:", block.timestamp);
        
        // Show updated position
        HypurrFiVault.UserPosition memory position4 = vault.getUserPosition(user);
        console2.log("User shares:", position4.shares / 1e18);
        console2.log("Net value: $", position4.netValue / 1e6);
        console2.log("Health factor:", position4.healthFactor / 1e18);
        console2.log("");
        
        // Step 7: Unstake (withdraw all)
        console2.log("STEP 7: Unstaking (withdrawing all)");
        console2.log("------------------------------------------------------------");
        uint256 userSharesBefore = vault.getUserShares(user);
        uint256 userUsdcBefore = usdc.balanceOf(user);
        
        vm.stopBroadcast();
        vm.startBroadcast(user);
        uint256 assetsReceived = vault.withdrawAll();
        vm.stopBroadcast();
        vm.startBroadcast();
        
        uint256 userUsdcAfter = usdc.balanceOf(user);
        uint256 userSharesAfter = vault.getUserShares(user);
        
        console2.log("Shares before:", userSharesBefore / 1e18);
        console2.log("Shares after:", userSharesAfter / 1e18);
        console2.log("USDC before:", userUsdcBefore / 1e6);
        console2.log("USDC after:", userUsdcAfter / 1e6);
        console2.log("Assets received:", assetsReceived / 1e6, "USDC");
        console2.log("Net gain:", (userUsdcAfter > userUsdcBefore ? (userUsdcAfter - userUsdcBefore) : 0) / 1e6, "USDC");
        console2.log("");
        
        // Final stats
        console2.log("FINAL VAULT STATS:");
        console2.log("------------------------------------------------------------");
        HypurrFiVault.VaultStats memory finalStats = vault.getVaultStats();
        console2.log("Total shares:", finalStats.totalShares / 1e18);
        console2.log("Total assets: $", finalStats.totalAssets / 1e6);
        console2.log("Total collateral: $", finalStats.totalCollateral / 1e8);
        console2.log("Total debt: $", finalStats.totalDebt / 1e8);
        console2.log("");
        
        console2.log("============================================================");
        console2.log("Full flow completed successfully!");
        console2.log("============================================================");
        
        vm.stopBroadcast();
    }
    
    function _fundUser(address usdcAddress, address user, uint256 amount) internal {
        IERC20 token = IERC20(usdcAddress);
        
        // Common USDC whale addresses (adjust for your network)
        address[] memory potentialWhales = new address[](2);
        potentialWhales[0] = address(0x68e37dE8d93d3496ae143F2E900490f6280C57cD);
        potentialWhales[1] = address(0x462B95575cb2D56de9d1aAaAAb452279B058Aa06);
        
        address whale;
        
        // Find a whale with enough balance
        for (uint i = 0; i < potentialWhales.length; i++) {
            try token.balanceOf(potentialWhales[i]) returns (uint256 balance) {
                if (balance > amount * 2) {
                    whale = potentialWhales[i];
                    break;
                }
            } catch {
                // Continue to next whale if this one fails
                continue;
            }
        }
        
        require(whale != address(0), "No USDC whale found - try different addresses or check network");
        
        console2.log("Using whale:", whale);
        console2.log("Whale balance:", token.balanceOf(whale) / 1e6, "USDC");
        
        // When broadcasting, we need to broadcast as the whale to transfer tokens
        // Stop current broadcast, switch to whale, transfer, then switch back
        vm.stopBroadcast();
        vm.startBroadcast(whale);
        token.transfer(user, amount);
        vm.stopBroadcast();
        vm.startBroadcast();
        
        console2.log("Funded user with", amount / 1e6, "USDC");
    }
}

