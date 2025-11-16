// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {Hy007FreeVault} from "../src/Hy007FreeVault.sol";
import {IERC20} from "../src/interfaces/IPool.sol";

contract InteractScript is Script {
    function run() external view {
        address vaultAddress = vm.envAddress("VAULT_ADDRESS");
        address user = msg.sender;
        
        Hy007FreeVault vault = Hy007FreeVault(vaultAddress);

        console2.log("============================================================");
        console2.log("HypurrFi Vault - Position Viewer");
        console2.log("============================================================");
        console2.log("Vault:", vaultAddress);
        console2.log("User:", user);
        console2.log("");

        // User Position
        console2.log("YOUR POSITION:");
        console2.log("------------------------------------------------------------");
        
        Hy007FreeVault.UserPosition memory position = vault.getUserPosition(user);
        
        if (position.shares == 0) {
            console2.log("No position found. Deposit to get started!");
        } else {
            console2.log("Shares Owned:", position.shares / 1e18);
            console2.log("Net Value: $", position.netValue / 1e6);
            console2.log("Collateral: $", position.collateralValue / 1e8);
            console2.log("Debt: $", position.debtValue / 1e8);
            console2.log("Health Factor:", position.healthFactor / 1e18);
            console2.log("Current LTV:", position.currentLTV / 100, "%");
            console2.log("Leverage:", position.leverageRatio / 10000, "x");
        }
        console2.log("");

        // Vault Stats
        console2.log("VAULT STATISTICS:");
        console2.log("------------------------------------------------------------");
        
        Hy007FreeVault.VaultStats memory stats = vault.getVaultStats();
        console2.log("Total Shares:", stats.totalShares / 1e18);
        console2.log("Total Assets: $", stats.totalAssets / 1e6);
        console2.log("Total Collateral: $", stats.totalCollateral / 1e8);
        console2.log("Total Debt: $", stats.totalDebt / 1e8);
        console2.log("Current APY:", stats.currentAPY / 1e25, "%");
        console2.log("Vault Health Factor:", stats.healthFactor / 1e18);
        console2.log("TVL: $", vault.getTVL() / 1e6);
        console2.log("");
        console2.log("============================================================");
    }

    // Helper functions for deposit/withdraw via forge script
    function deposit(uint256 amount) external {
        address vaultAddress = vm.envAddress("VAULT_ADDRESS");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        
        vm.startBroadcast();

        IERC20(usdcAddress).approve(vaultAddress, amount);
        uint256 shares = Hy007FreeVault(vaultAddress).deposit(amount);

        vm.stopBroadcast();

        console2.log("Deposited:", amount / 1e6, "USDC");
        console2.log("Received:", shares / 1e18, "shares");
    }

    function withdraw(uint256 shareAmount) external {
        address vaultAddress = vm.envAddress("VAULT_ADDRESS");
        
        vm.startBroadcast();

        uint256 assets = Hy007FreeVault(vaultAddress).withdraw(shareAmount);

        vm.stopBroadcast();

        console2.log("Withdrawn:", assets / 1e6, "USDC");
    }

    function withdrawAll() external {
        address vaultAddress = vm.envAddress("VAULT_ADDRESS");
        
        vm.startBroadcast();

        uint256 assets = Hy007FreeVault(vaultAddress).withdrawAll();

        vm.stopBroadcast();

        console2.log("Withdrawn all:", assets / 1e6, "USDC");
    }
}
