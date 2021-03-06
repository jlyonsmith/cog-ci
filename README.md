# Cog CI

_Cog CI_ is an uncomplicated continuous integration system written in Node.js. It is designed to run inside your network or datacenter and be controlled through Slack. It integrates to both GitHub and BitBucket. It supports 4 types of integrations:

- Pull request builds
- Master branch builds
- Release branch builds
- Release deployments

You can use it for numerous types of products including mobile apps, WebPack based websites, NodeJS/Babel backends, etc.. It's designed to on Linux systems. It's been tested on Ubuntu but should run on other variants. The system can include multiple build actors which can be on different physical systems with different operating system. So for example you can set up a build actor on a macOS system to perform mobile integrations.

It requires that you install:

- Node.js
- RabbitMQ
- Redis
- MongoDB
- Consul

You'll also need a way for the system to access the internet for the GitHub/BitBucket/Slack integrations. It is highly recommended that you do this through a forward proxy such as Squid, nginx or tengine. If you use nginx you'll need to use the connect module for HTTPS. You'll also need a mechanism to create trusted SSL certificates for the system. I highly recommend Let's Encrypt!.

## Setup

The follow sections will walk you through the required setup.

### Node.js

On Ubuntu, you can install Node.js via `apt`. On macOS I recommend you install Node.js via Homebrew.

### Installation

On Linux, install the full Cog CI service using:

```bash
npm install cog-ci -g
```

Before you do anything create a `config/default.json5` file with the following format:

```
{
  "logDir": "",
  "actors": [
    { "name": "web" },
    { "name": "integration" },
    { "name": "git" },
    { "name": "bit" },
    { "name": "schedule" },
    { "name": "slack" }
  ],
  "serviceName": {
    "system": "cog",
    "server": "cog-server",
    "web": "cog-web",
    "integration": "cog-integration",
    "git": "cog-git",
    "bit": "cog-bit",
    "schedule": "cog-schedule",
    "slack": "cog-slack"
  },
  "web": {
    "port": "8005"
  },
  "slack": {
    "buildChannel": "dev-bots",
    "pullRequestChannel": "dev-bots",
    "token": "xxxxxxxxxxxxxxxxx"
  },
  "integration": {
    "rootPath": "$HOME/cog-root",
    "templateDir": "template",
    "repoHost": "git@bitbucket.org"
  },
  "schedule": {
    "pollSeconds": 5,
    "processTimeoutSeconds": 600
  }
}
```

Use consul-extra tool to set up some configuration parameters:

```
{
  "cog": {
    "config": {
      "production": {
        "uri": {
          "amqp": "amqp://localhost",
          "mongo": "mongodb://localhost/cog-v1",
          "redis": "redis://localhost"
        }
      },
      "development": {
        "uri": {
          "amqp": "amqp://localhost",
          "mongo": "mongodb://localhost/cog-v1",
          "redis": "redis://localhost"
        }
      }
    }
  }
}
```

Customize the build scripts based on your project type.

### Slack

Firstly, set up a [Slack](https://slack.com) account for your organization. Navigating the Slack API configuration can be quite a challenge. You'll be creating a bot as a custom integration to Slack.

1. In a web browser, navigate to https://api.slack.com/bot-users
2. Click on the "creating a new bot user" button.
3. Give the bot an @ name, following the onscreen instructions.
4. On the next screen, give the bot a description and copy the API token to the `.bbconfig` file as the `config.slack_api_token` value.

Now you have a build bot configured, start the `cog-ci` script. Next start a private conversation with your bot and ask it something like, "What is your status?" Actually, it will respond to just the words **status** and **help** too.

### BitBucket

If you are using bitbucket cloud as your repo host, as we assume we are for this round, set it up here.

#### Create BitBucket App password

(Used for API Authentication)

1. Click on your account icon in the bottom left corner
2. Select "Bitbucket settings"
3. Under "Access Managemenet" select "App passwords" and click "Create app password"
4. Add this password to your config file

#### Prepare your repo to use Webhooks

1. Settings -> Webhooks -> Add webhook
2. Give it a title and enter the URl for where the web actor will recieve the webhook request
3. Set the triggers.
4. Triggers -> Choose from a full list of triggers
5. Select all the checkboxes under "Pull Request" then click "Save"

### GitHub

Next it's time to get GitHub integration working. You'll need to generate a personal access token for the user that will be committing build tags and version updates for the build.

1. Log in to GitHub as the user that the build will be acting as. It's wise to create a user specifically for builds to avoid giving access to you personal GitHub account.
2. Go to the drop down in the top right hand corner (the one with the user icon, next to the arrow) and select **Settings** from the menu.
3. Go to **Personal access tokens** and create a new token.
4. Give the token a name, including for example the machine the token is used on, the words "cog-cicog-ci", etc.. Select repo, repo:status, repo_deployment, public_repo, write:repo_hook, read:repo_hook scopes, then **Generate token**
5. Copy the token on this screen into the `config.github_api_token` setting in the `.bbconfig`

Finally, you need to set up a webhook for pull-requests to the repository. Do the steps:

1. In order for GitHub to send events to your `cog-ci` instance you must have an endpoint visible over the Internet. I _strongly_ recommend you only use HTTPS for the webhook events. There are a couple of good ways to create the webhook endpoint:
   1. Install [ngrok](http://ngrok.com) in order to create a public endpoint that GitHub can send the web hook to. Super easy and a great way to get started. You configure ngrok to forward requests to `cog-ci` on your local machine.
   2. Use a web server such as [nginx](http://nginx.org) running on the same machine as `cog-ci` that can proxy the requests to `cog-ci`. Instructions on how to configure nginx to that can be found in [nginx Configuration](https://github.com/jlyonsmith/HowTo/blob/master/nginx_configuration.md).
2. Once you know the webhook endpoint endpoint, e.g. https://api.mydomain.com/, go to the master repo for the project (the one that all the forks will create pull request too) and select **Settings**
3. Enter the URL for the webhook, plus the path `/webhook`.
4. Create secret token using for use by the webhook. This lets `cog-ci` know the call is actually from GitHub:

   ```bash
   ruby -rsecurerandom -e 'puts SecureRandom.hex(20)'
   ```

   Then, paste this token into the `.bbconfig` file under the `config.github_webhook_secret_token` setting.

5. Finally, select "Let me select individual events" and check the "Pull Request" checkbox

As soon as you save the webhook it will send a `ping` message to the `cog-ci` service. You should get a 200 reponse. If you do then congratulations, GitHub is talking to your `cog-ci` instance. You will now get a buddy build status check on your pull requests.

After you have done at least one pull request, you can go to "Settings > Branches" and enable branch protection for any branches you desire, thus _requiring_ buddy builds before commits can be made to those branches.

### MongoDB

Finally, cog-ci must be configured to write build metrics to a MongoDB database. Setting up MongoDB properly, with it's own user and group and password protected accounts, is straightforward but requires quite a few steps. Follow the instructions in [Installing MongoDB on macOS](https://github.com/jlyonsmith/HowTo/blob/master/Install_MongoDB_on_macOS.md).

Once you have MongoDB up and running, simply add an entry to the `.bbconfig` file:

```ruby
config.mongo_uri = "mongodb://user:password@localhost:27017/cog-ci"
```

or if you choose not to use a user/password:

```ruby
config.mongo_uri = "mongodb://localhost:27017/cog-ci"
```

### Environment Variables

The following variables are passed into the `config.branch_build_script` and `config.pull_request_build_script`:

- `BB_BUILD_OUTPUT_DIR` is the directory where the build log is placed and where report files should be placed.
- `BB_BUILD_SCRIPT` the name of the build script being run.
- `BB_GIT_BRANCH` the branch being built.
- `BB_GIT_REPO_NAME` the repo name.
- `BB_GIT_REPO_OWNER` the repo owner.
- `BB_METRICS_DATA_FILE` the name of the build metrics file.
- `BB_MONGO_URI` the full URI for connecting to the MongoDB for report generation.
