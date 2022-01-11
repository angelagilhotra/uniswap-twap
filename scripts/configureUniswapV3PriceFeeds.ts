import { abi as IUniswapV3PoolABI } from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";
import { tickToPrice } from "@uniswap/v3-sdk";
import { Token } from "@uniswap/sdk-core";
import config from "../config/priceConfig.json";
import { BigNumber, ethers } from "ethers";
import minimist from "minimist";

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
interface observation {
  tickCumulatives: [BigNumber, BigNumber];
  secondsPerLiquidityCumulativeX128s: [BigNumber, BigNumber];
}

const getPoolState = async (poolContract: ethers.Contract) => {
  const [liquidity, slot] = await Promise.all([
    poolContract.liquidity(),
    poolContract.slot0(),
  ]);

  const PoolState: State = {
    liquidity,
    sqrtPriceX96: slot[0],
    tick: slot[1],
    observationIndex: slot[2],
    observationCardinality: slot[3],
    observationCardinalityNext: slot[4],
    feeProtocol: slot[5],
    unlocked: slot[6],
  };

  return PoolState;
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

const getObservation = async (
  poolContract: ethers.Contract,
  twap: number
): Promise<observation> => poolContract.observe([twap, 0]);

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

const getPrices = async (poolConfig: any, twap: number): Promise<any> => {
  const poolAdress = poolConfig.address;
  const contract = getPoolContract(poolAdress);
  const state = await getPoolState(contract);
  const immutables = await getPoolImmutables(contract);

  let tick: number | undefined;
  if (twap === 0) {
    tick = state.tick;
  } else {
    const { tickCumulatives } = await getObservation(contract, twap);
    tick =
      (tickCumulatives[1].toNumber() - tickCumulatives[0].toNumber()) / twap;
  }

  if (tick === undefined) throw new Error("Unable to create tick");

  const token0Decimals = await getDecimals(immutables.token0);
  const token1Decimals = await getDecimals(immutables.token1);
  const token0 = new Token(1, immutables.token0, token0Decimals);
  const token1 = new Token(1, immutables.token1, token1Decimals);

  const initial = tickToPrice(token0, token1, tick).toSignificant(8);

  const configured = Object.keys(poolConfig.pricePerBlock).map(
    (block) => poolConfig.pricePerBlock[block]
  );

  const bumpingTick = Object.keys(poolConfig.pricePerBlock).map((block) =>
    tickToPrice(
      token0,
      token1,
      tick + poolConfig.pricePerBlock[block]
    ).toSignificant(8)
  );

  return {
    initial,
    configured,
    bumpingTick,
  };
};

const main = async () => {
  const argv = minimist(process.argv.slice(2));
  if (
    !argv.token ||
    typeof argv.token !== "string" ||
    typeof argv.twap === "boolean"
  ) {
    throw new Error(
      "usage: npx ts-node scripts/configureUniswapV3PriceFeeds.ts --token DAI/USDC --twap 2"
    );
  }
  const tokenPair = argv.token.toUpperCase();
  const twap = Number(argv.twap ?? 0);
  const poolConfig = config.find((o) => o.name === tokenPair);
  if (!poolConfig) throw new Error("Config for pair not found");

  const price = await getPrices(poolConfig, twap);
  console.log(price);
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
