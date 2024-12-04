const { WebSocket } = require("ws");

const token = "ory_at_-JFdtKNUUtMlpSMJPcxg-OzI6I9FsyWLc_pUrj-ZyeY.O8cPOUX4Fw9rY3CV-guoNlp4WKbmVnJ98Hx6sBnXMh4";

const bitqueryConnection = new WebSocket(
  `wss://streaming.bitquery.io/eap?token=${token}`,
  ["graphql-ws"]
);

bitqueryConnection.on("open", () => {
  console.log("Connected to Bitquery.");

  // Send initialization message (connection_init)
  const initMessage = JSON.stringify({ type: "connection_init" });
  bitqueryConnection.send(initMessage);
});

bitqueryConnection.on("message", (data) => {
  const response = JSON.parse(data);

  if (response.type === "connection_ack") {
    console.log("Connection acknowledged by server.");

    // Send subscription message after receiving connection_ack
    const subscriptionMessage = JSON.stringify({
      type: "start",
      id: "1",
      payload: {
        query: `
        subscription {
          Solana {
            Instructions(
              where: {Instruction: {Program: {Method: {is: "create"}, Name: {is: "pump"}}}}
            ) {
              Block {
                Time
              }
              Instruction {
                Accounts {
                  Token {
                    Mint
                    Owner
                  }
                }
                Program {
                  Arguments {
                    Name
                    Type
                    Value {
                      ... on Solana_ABI_String_Value_Arg {
                        string
                      }
                    }
                  }
                  Method
                  Name
                }
              }
            }
          }
        }
        `,
      },
    });

    bitqueryConnection.send(subscriptionMessage);
    console.log("Subscription message sent.");
  }

  if (response.type === "data") {
    const instructions = response.payload.data.Solana.Instructions;
    instructions.forEach(instruction => {
      const time = instruction.Block.Time;
      const tokenAccount = instruction.Instruction.Accounts.find(account => account.Token.Mint);
      const mint = tokenAccount?.Token.Mint;
      const owner = tokenAccount?.Token.Owner;
      const arguments = instruction.Instruction.Program.Arguments;

      const nameArg = arguments.find(arg => arg.Name === "name");
      const symbolArg = arguments.find(arg => arg.Name === "symbol");
      const uriArg = arguments.find(arg => arg.Name === "uri");

      const name = nameArg?.Value.string;
      const symbol = symbolArg?.Value.string;
      const uri = uriArg?.Value.string;

      console.log("Token Data:");
      console.log("Time:", time);
      console.log("Mint:", mint);
      console.log("Owner:", owner);
      console.log("Name:", name);
      console.log("Symbol:", symbol);
      console.log("URI:", uri);
      console.log("--------------------------------------------------");
    });
  }

  if (response.type === "error") {
    console.error("Error message received:", response.payload.errors);
  }
});

bitqueryConnection.on("close", () => {
  console.log("Disconnected from Bitquery.");
});

bitqueryConnection.on("error", (error) => {
  console.error("WebSocket Error:", error);
}); 