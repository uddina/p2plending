// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract StableToken is ERC20 {
    constructor() ERC20("Stable USD Token", "SUSD") {
        uint256 totalSupply = 100000000 * (10 ** decimals()); // 100,000,000 tokens with 18 decimal places
        _mint(msg.sender, totalSupply);
    }
}
