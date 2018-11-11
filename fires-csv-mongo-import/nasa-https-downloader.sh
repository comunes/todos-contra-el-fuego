#!/bin/bash

KEY=$1
export SENTRY_DSN=$2
DEST=$3

DEBUG=0

# https://stackoverflow.com/questions/1715137/what-is-the-best-way-to-ensure-only-one-instance-of-a-bash-script-is-running
currsh=$0
currpid=$$
countpid=$(lsof -t $currsh| wc -l)
runpid=$(pgrep -of $currsh)
if [[ countpid -gt 1 && ! $runpid == $currpid ]]
then
  if [[ $DEBUG ]] ; then echo "At least one of \"$currsh\" is running !!!"; fi
  secondsRunning=`date +%s --date="now - $( stat -c%X /proc/$runpid ) seconds"`
  if [[ secondsRunning -gt 1200 ]] # wait 20 mins
  then
      if [[ $DEBUG ]] ; then echo "Killing previous $currsh process"; fi
      kill -9 $runpid
  else
      # Wait til some timeout
      exit 0
  fi
fi


function onGeneralError {
    err_msg=$1
    if [[ $DEBUG -eq 0 ]] ; then /usr/local/bin/sentry-cli send-event -m "$err_msg"; fi
    echo $err_msg
    exit 1
}

function onError {
    err_msg="Download of nrt$1 failed, return code: $2"
    onGeneralError "$err_msg"
}

function trap_err_report() {
    onGeneralError "Error on line $1"
}

trap 'trap_err_report $LINENO' ERR

# ZONES="Alaska Australia_NewZealand Canada Central_America Europe Northern_and_Central_Africa Russia_Asia SouthEast_Asia South_America South_Asia Southern_Africa USA_contiguous_and_Hawaii"
# ZONE="Central_America"
ZONE="Global"

if [[ $# != 3 ]]
then
    echo "Usage: $0 nasa-user nasa-key sentry-key /destination-dir"
    exit 1
fi

FILES=""

SERVER3_up=$(nc -z -v -w5 nrt3.modaps.eosdis.nasa.gov 443 2> /dev/null)
SERVER4_up=$(nc -z -v -w5 nrt4.modaps.eosdis.nasa.gov 443 2> /dev/null)

if [[ $SERVER3_up -ne 0 && $SERVER4_up -eq 0 ]] ; then
    FORCE_SERVER=4;
else
    if [[ $SERVER4_up -ne 0 && $SERVER3_up -eq 0 ]]
    then
        FORCE_SERVER=3;
        if [[ $SERVER4_up -eq 0 && $SERVER3_up -eq 0 ]]
        then
            // All servers up!
            FORCE_SERVER=""
        else
            onGeneralError "All NASA servers down!"
        fi
    fi
fi

LASTSERVERF=$DEST/lastserver.txt

if [[ -n $FORCE_SERVER ]]
then
    NEXTSERVER=$FORCE_SERVER
else
    if [[ -f $LASTSERVERF ]]
    then
        LASTSERVER=$(cat $LASTSERVERF)
        if [[ $LASTSERVER = 3 ]]
        then
            NEXTSERVER=4
        else
            NEXTSERVER=3
        fi
    else
         # First run
        NEXTSERVER=3
    fi
fi

echo $NEXTSERVER > $LASTSERVERF

SERVER=$NEXTSERVER
if [[ $DEBUG ]] ; then echo "Server: nrt$SERVER"; fi

DAY_OF_YEAR=$(date --utc +%j)
YEAR=$(date --utc +%Y)

# TODO DAY_OF_YEAR at 0:00 ??

# TODO check if server up with the output of
# nc -z -v -w5 nrt4.modaps.eosdis.nasa.gov 21

server_url="https://nrt$SERVER.modaps.eosdis.nasa.gov/api/v2/content/archives/"
curr_file="${YEAR}${DAY_OF_YEAR}.txt"
modis_path="FIRMS/c6/${ZONE}/MODIS_C6_${ZONE}_MCD14DL_NRT_${curr_file}"
viirs_path="FIRMS/viirs/${ZONE}/VIIRS_I_${ZONE}_VNP14IMGTDL_NRT_${curr_file}"

function down {
    if [[ $DEBUG ]] ; then echo "We'll copy $7 to $8"; fi
    # https://superuser.com/questions/908293/download-file-via-http-only-if-changed-since-last-update
    # download_cmd="wget --timeout=60 -N -m -e robots=off -np -R .html,.tmp -nH --cut-dirs=4 ${1}${2} --header 'Authorization: Bearer $3' -P $4 -S"
    # wget_return=$(eval ${download_cmd} 2>&1 |  egrep "  HTTP/1.1" | head -1 | awk '{print $2}')
    # cp $7 $8

    if test -e "$8"; then zflag="-z '$8'"; else zflag= ; fi
    download_cmd="curl -s $zflag -w %{http_code} -H 'Authorization: Bearer $3' $1$2 -o $8"
    download_return=$(eval ${download_cmd} 2>&1)

    if [[ $DEBUG ]] ; then echo Result: $download_return; fi
    if [[ $download_return -eq 304 ]]
    then
        if [[ $DEBUG ]] ; then echo "$6 data not modified"; fi
    else
        if [[ $download_return -eq 200 ]]; then
            FILES="$FILES $8"
            if [[ $DEBUG ]] ; then echo "$6 data modified"; fi
        else
            onError $5 $download_return
        fi
    fi
}

down $server_url $modis_path $KEY $DEST $SERVER "MODIS" "${DEST}/${modis_path}" "${DEST}/modis.txt"
down $server_url $viirs_path $KEY $DEST $SERVER "VIIRS" "${DEST}/${viirs_path}" "${DEST}/viirs.txt"

if [[ -n $FILES ]]
then
    if [[ $DEBUG ]] ; then echo "Files to import $FILES"; fi
    /usr/local/bin/node fires-csv-mongo-import.js $FILES
else
    if [[ $DEBUG ]] ; then echo "No files to import"; fi
fi

exit 0
