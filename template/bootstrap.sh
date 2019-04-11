#!/bin/bash
echo "Cog-CI Task Runner V0.2. Begin Task..."
purpose=$1
repo_host=$2
repo_owner=$3
repo_name=$4
current_dir=$(pwd)
task_start_time_sec=$( date +"%s" )
end_time_sec=0
echo purpose: ${purpose} host ${repo_host} repo_owner: ${repo_owner} repo_name: ${repo_name} current_dir: $current_dir  start_time: $task_start_time_sec

if [ "$purpose" == "pullRequest" ]; then
  # do pull request
  # clone ==========================================
  echo "Beginning Pull Request"
  echo Pulling sources to $(pwd)/${repo_name}
  start_time_sec=$( date +"%s" )
  if ! git clone ${repo_host}:${repo_owner}/${repo_name}.git ${repo_name}; then
    echo ERROR: Unable to clone repository
    exit 1
  fi
  end_time_sec=$( date +"%s" )
  let elapsed=end_time_sec-start_time_sec
  echo "Repo cloned... in " ${elapsed} "seconds"
  # =================================================
  echo "changing to cloned repo"
  cd ${repo_name}
  # Install Node Modules =============================
  echo "setting up node modules..."
  start_time_sec=$( date +"%s" )
  #---
  npm install > "../npm_install.log"
  #---
  end_time_sec=$( date +"%s" )
  let elapsed=end_time_sec-start_time_sec
  echo "Node Modules installed in " ${elapsed} "seconds"

else
  # no other purposes supported at this time
  echo "Purpose not supported"
  exit 2
fi

end_time_sec=$( date +"%s" )
let elapsed=end_time_sec-task_start_time_sec
echo "Task Complete in " ${elapsed} " second"