// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {HypurrFiVault} from "../src/HypurrFiVault.sol";

contract DeployScript is Script {
    function run() external returns (HypurrFiVault) {
        // Load environment variables
        address poolAddress = vm.envAddress("POOL_ADDRESS");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        address treasury = msg.sender; // Use deployer as treasury

        console2.log("============================================================");
        console2.log("Deploying HypurrFiVault");
        console2.log("============================================================");
        console2.log("Pool Address:", poolAddress);
        console2.log("USDC Address:", usdcAddress);
        console2.log("Treasury:", treasury);
        console2.log("");

        vm.startBroadcast();

        // Deploy vault
        HypurrFiVault vault = new HypurrFiVault(
            poolAddress,
            usdcAddress,      // depositAsset
            usdcAddress,      // borrowAsset (same asset for simplicity)
            address(0),       // hyToken (can be obtained from pool if needed)
            treasury
        );

        vm.stopBroadcast();

        console2.log("HypurrFiVault deployed at:", address(vault));
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
