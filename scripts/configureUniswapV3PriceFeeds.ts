import { abi as IUniswapV3PoolABI } from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";
import { Pool, priceToClosestTick, tickToPrice } from "@uniswap/v3-sdk";
import { CurrencyAmount, Price, Token } from "@uniswap/sdk-core";
import config from "../config/priceConfig.json";
import { BigNumber, ethers } from "ethers";
import minimist from "minimist";
import { network } from "hardhat";
const provider = new ethers.providers.JsonRpcProvider();

interface Immutables {
  factory: string;
  token0: string;
  token1: string;
  fee: number;
  tickSpacing: number;
  maxLiquidityPerTick: ethers.BigNumber;
}
interface State {
  liquidity: ethers.BigNumber;
  sqrtPriceX96: ethers.BigNumber;
  tick: number;
  observationIndex: number;
  observationCardinality: number;
  observationCardinalityNext: number;
  feeProtocol: number;
  unlocked: boolean;
}

const getPoolState = async (poolContract: ethers.Contract, block: string) => {
  // const [liquidity, slot] = await Promise.all([
  //   poolContract.liquidity({ blockTag: block }),
  //   poolContract.slot0({ blockTag: block }),
  // ]);
  const slot0Call = await poolContract.slot0();
  const slot0Raw = await provider.getStorageAt(poolContract.address, 0);
  return slot0Raw.toString();

  // const PoolState: State = {
  //   liquidity: liquidity.toString(),
  //   sqrtPriceX96: slot[0].toString(),
  //   tick: slot[1],
  //   observationIndex: slot[2],
  //   observationCardinality: slot[3],
  //   observationCardinalityNext: slot[4],
  //   feeProtocol: slot[5],
  //   unlocked: slot[6],
  // };
};

const getPoolImmutables = async (poolContract: ethers.Contract) => {
  const [factory, token0, token1, fee, tickSpacing, maxLiquidityPerTick] =
    await Promise.all([
      poolContract.factory(),
      poolContract.token0(),
      poolContract.token1(),
      poolContract.fee(),
      poolContract.tickSpacing(),
      poolContract.maxLiquidityPerTick(),
    ]);

  const immutables: Immutables = {
    factory,
    token0,
    token1,
    fee,
    tickSpacing,
    maxLiquidityPerTick,
  };
  return immutables;
};

const getPoolContract = (address: string): ethers.Contract =>
  new ethers.Contract(address, IUniswapV3PoolABI, provider);

const getDecimals = (address: string): Promise<number> =>
  new ethers.Contract(
    address,
    [
      {
        inputs: [],
        name: "decimals",
        outputs: [
          {
            internalType: "uint8",
            name: "",
            type: "uint8",
          },
        ],
        stateMutability: "view",
        type: "function",
      },
    ],
    provider
  ).decimals();

const setStorage = async (address: string) => {
  console.log("setting storage");
  await network.provider.send("hardhat_setStorageAt", [
    address,
    "0x0",
    // change this
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  ]);
};

const getPrices = async (poolConfig: any): Promise<void> => {
  // const pricePerBlock = poolConfig.pricePerBlock;
  const poolAdress = poolConfig.address;

  // for (const [key, value] of Object.entries(pricePerBlock)) {
  // const block: string = key;
  // const quotePrice: number = Number(value);
  const contract = getPoolContract(poolAdress);
  console.log("before");
  console.log({ state: await getPoolState(contract, "latest") });
  await setStorage(poolAdress);
  console.log("after");
  console.log({ state: await getPoolState(contract, "latest") });
  // const parsed = ethers.utils.parseBytes32String(state);
  // await contract.slot0()
  // const immutables = await getPoolImmutables(contract);
  // const token0Decimals = await getDecimals(immutables.token0);
  // const token1Decimals = await getDecimals(immutables.token1);
  // const token0 = new Token(1, immutables.token0, token0Decimals);
  // const token1 = new Token(1, immutables.token1, token1Decimals);
  // const tickForPrice = priceToClosestTick(priceToGet);
  // const { tick } = await getPoolState(contract, block);
  // const price: string = tickToPrice(token0, token1, tick).toSignificant(8);
  // console.log({ block, price });
  // }
};

const main = async () => {
  const argv = minimist(process.argv.slice(2));
  if (!argv.token || typeof argv.token !== "string") {
    throw new Error(
      "usage: npx ts-node scripts/configureUniswapV3PriceFeeds.ts --token DAI/USDC"
    );
  }
  const tokenPair = argv.token.toUpperCase();
  const poolConfig = config.find((o) => o.name === tokenPair);
  if (!poolConfig) throw new Error("Config for pair not found");
  await getPrices(poolConfig);
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
