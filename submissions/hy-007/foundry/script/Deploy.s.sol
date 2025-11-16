// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {Hy007FreeVault} from "../src/Hy007FreeVault.sol";
import {IERC20} from "../src/interfaces/IPool.sol";

contract DeployScript is Script {
    function run() external returns (Hy007FreeVault) {
        // Load environment variables
        address poolAddress = vm.envAddress("POOL_ADDRESS");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        
        // Get test user address (optional env var, defaults to msg.sender)
        address testUser;
        try vm.envAddress("TEST_USER") returns (address user) {
            testUser = user;
        } catch {
            testUser = msg.sender; // Default to deployer if not specified
        }

        console2.log("============================================================");
        console2.log("Deploying Hy007FreeVault");
        console2.log("============================================================");
        console2.log("Pool Address:", poolAddress);
        console2.log("USDC Address:", usdcAddress);
        console2.log("Test User:", testUser);
        console2.log("");

        vm.startBroadcast();

        // Check initial USDC balance
        IERC20 usdc = IERC20(usdcAddress);
        uint256 balanceBefore = usdc.balanceOf(testUser);
        console2.log("Test user USDC balance (before):", balanceBefore / 1e6, "USDC");
        console2.log("");

        // Deploy vault
        console2.log("Deploying vault contract...");
        Hy007FreeVault vault = new Hy007FreeVault(
            poolAddress,
            usdcAddress,      // depositAsset
            usdcAddress,      // borrowAsset (same asset for simplicity)
            address(0)        // hyToken (can be obtained from pool if needed)
        );

        // Log vault address immediately after deployment (before stopBroadcast)
        // This ensures we have the address even if something fails later
        console2.log("Hy007FreeVault deployed at:", address(vault));
        console2.log("");

        vm.stopBroadcast();
        
        // Verify deployment by checking if contract has code
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(vault)
        }
        require(codeSize > 0, "Deployment failed: contract has no code");
        console2.log("[OK] Deployment verified: contract has code");
        
        // Check balance after deployment (these are view calls, won't affect deployment)
        uint256 balanceAfter = usdc.balanceOf(testUser);
        console2.log("Test user USDC balance (after deployment):", balanceAfter / 1e6, "USDC");
        console2.log("");
        
        // Note: If balance is 0, use the deploy.sh script which handles funding automatically
        if (balanceAfter == 0) {
            console2.log("NOTE: User has 0 USDC balance.");
            console2.log("      Use ./script/deploy.sh to automatically fund and deploy.");
            console2.log("      Or manually fund using cast commands (see deploy.sh for reference).");
            console2.log("");
        }
        console2.log("");
        console2.log("Next steps:");
        console2.log("1. Update VAULT_ADDRESS in .env");
        console2.log("2. Update frontend/.env.local with:");
        console2.log("   NEXT_PUBLIC_VAULT_ADDRESS=", address(vault));
        console2.log("   NEXT_PUBLIC_USDC_ADDRESS=", usdcAddress);
        console2.log("");
        console2.log("============================================================");

        return vault;
    }
}
