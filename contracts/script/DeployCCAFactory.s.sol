// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ContinuousClearingAuctionFactory} from 'lib/continuous-clearing-auction/src/ContinuousClearingAuctionFactory.sol';
import {IContinuousClearingAuctionFactory} from 'lib/continuous-clearing-auction/src/interfaces/IContinuousClearingAuctionFactory.sol';
import 'forge-std/Script.sol';
import 'forge-std/console2.sol';

contract DeployContinuousAuctionFactoryScript is Script {
    function run() public returns (IContinuousClearingAuctionFactory factory) {
        vm.startBroadcast();

        // FIX 1: Remove the protocolFeeController variable from the hash encoding
        bytes32 initCodeHash = keccak256(
            abi.encodePacked(type(ContinuousClearingAuctionFactory).creationCode)
        );
        console2.logBytes32(initCodeHash);

        bytes32 salt = 0x0f84ad422f72ecae6c249cacbf685a23f203447ecbaf32e8b94ca0a40ea09828;
        
        // FIX 2: Pass 0 arguments into the new contract constructor instance
        factory = IContinuousClearingAuctionFactory(
            address(new ContinuousClearingAuctionFactory{salt: salt}())
        );

        console2.log('ContinuousClearingAuctionFactory deployed to:', address(factory));
        vm.stopBroadcast();
    }
}
