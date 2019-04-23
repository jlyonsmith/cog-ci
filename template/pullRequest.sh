#!/bin/bash
echo "Cog-CI Task Runner V0.2. Begin Task..."
purpose=$1
repo_host=$2
repo_owner=$3
repo_name=$4
branch=$5
pr_number=$6
current_dir=$(pwd)
task_start_time_sec=$( date +"%s" )
end_time_sec=0

echo =================================================================
echo pullRequest.sh Cog-CI PullRequest Task
echo
echo purpose: ${purpose}
echo host: ${repo_host}
echo repo_owner: ${repo_owner}
echo repo_name: ${repo_name}
echo branch: ${branch}
echo pullRequest: ${pr_number}
echo current_dir: $current_dir
echo start_time: $task_start_time_sec

if [ "$purpose" == "pullRequest" ]; then
  # do pull request
  # clone ==========================================
  echo "Beginning Pull Request"
  echo Pulling sources to $(pwd)/${repo_name}
  start_time_sec=$( date +"%s" )
  if ! git clone ${repo_host}:${repo_owner}/${repo_name}.git ${repo_name}; then
    echo ERROR: Unable to clone repository
    exit 1
    echo ">>>Result: (Fail: Error GIT Clone)"
  fi
  end_time_sec=$( date +"%s" )
  let elapsed=end_time_sec-start_time_sec
  echo "Repo cloned... in " ${elapsed} "seconds"
  # =================================================
  echo "changing to cloned repo"
  cd ${repo_name}

  # -------------------
  echo "fetching branch" ${branch}
  if ! git fetch origin ${branch}; then
    echo ERROR: fetching origin branch ${branch}
    echo ">>>Result: (Fail: Error GIT Fetch)"
    exit 1
  fi
  echo "checking out branch"
  git checkout ${branch}

  # Install Node Modules =============================
  echo "setting up node modules..."
  start_time_sec=$( date +"%s" )
  #---
  if ! npm install > "../npm_install.log" 2>&1 ; then
    echo ">>>Result: (Fail: npm install failed. See npm_install.log for details )"
    exit 1
  fi

  #---
  end_time_sec=$( date +"%s" )
  let elapsed=end_time_sec-start_time_sec
  echo "Node Modules installed in " ${elapsed} "seconds"
  # Run Tests ========================================
   echo "Running tests"
  start_time_sec=$( date +"%s" )
  #---
  if ! npm test > "../test.log" 2>&1; then
    echo "Tests failed. See tests.log for details"
    echo ">>>Result: (Fail: Tests Failed)"
    exit 1
  else
    echo "Tests all passed"
  fi

  #---
  end_time_sec=$( date +"%s" )
  let elapsed=end_time_sec-start_time_sec
  echo "tests executed in " ${elapsed} "seconds"

else
  # no other purposes supported at this time
  echo "Purpose not supported"
  echo ">>>Result: (Fail: Arguments, purpose not supported)"
  exit 2
fi

end_time_sec=$( date +"%s" )
let elapsed=end_time_sec-task_start_time_sec
echo "Task Complete in " ${elapsed} " seconds"
echo ">>>Result: (Success: Task Completed OK)"