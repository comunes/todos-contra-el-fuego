#!/bin/bash
USER=$1
PASS=$2
DEST=$3
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

DEBUG=0

# ZONES="Alaska Australia_NewZealand Canada Central_America Europe Northern_and_Central_Africa Russia_Asia SouthEast_Asia South_America South_Asia Southern_Africa USA_contiguous_and_Hawaii"
ZONES="Global"
#ZONES="Central_America Europe South_America"

if [[ $# != 3 ]]
then
    echo "Usage: ftp-get-timestamp.sh nasa-user nasa-pass /destination-dir"
    exit 1
fi

function ftp-timestamp {
    ncftp -u $USER -p $PASS \
        ftp://$1 <<EOF | tail -20 | egrep '\.txt' | tail -1 | awk '{print $4"/"$7"/"$8}'
ls -lrt
EOF
    if [[ $? != 0 ]]; then
        echo "Error getting ftp timestamp"
    fi

}

function ftp-get {
    ncftpget -c -u $USER -p $PASS ftp://$1/$2 > $DEST/$3.tmp 2> /dev/null

    if [[ $? != 0 ]]; then
        echo "Error getting ftp data: "$? >> $DEST/nasa-download-errors.log
    else
        mv $DEST/$3.tmp $DEST/$3
    fi
}

MDIRTY=false
VDIRTY=false

for ZONE in $ZONES
do
    # TODO check if server up
    modis="nrt4.modaps.eosdis.nasa.gov/FIRMS/c6/$ZONE/"
    viirs="nrt4.modaps.eosdis.nasa.gov/FIRMS/viirs/$ZONE/"

    modisftp=`ftp-timestamp $modis`
    if [[ $DEBUG -eq 1 ]] ; then echo $modisftp; fi
    modist=`echo $modisftp | perl -p -e 's/(\d+)\/(\d{2}\:\d{2})\/(.*)(\d{4})(\d{3})(\.)(txt)/modis|$1|$2|$4|$5/g'`
    modisfile=`echo $modisftp | cut -d'/' -f 3`
    if [[ $DEBUG -eq 1 ]] ; then echo $modisfile; fi

    viirsftp=`ftp-timestamp $viirs`
    if [[ $DEBUG -eq 1 ]] ; then echo $viirsftp; fi
    viirst=`echo $viirsftp | perl -p -e 's/(\d+)\/(\d{2}\:\d{2})\/(.*)(\d{4})(\d{3})(\.)(txt)/viirs|$1|$2|$4|$5/g'`
    viirsfile=`echo $viirsftp | cut -d'/' -f 3`
    if [[ $DEBUG -eq 1 ]] ; then echo $viirsfile; fi

    MF=$DEST/modis-timestamp-$ZONE.txt
    VF=$DEST/viirs-timestamp-$ZONE.txt
    oldmodist=`cat $MF 2>/dev/null || echo emtpy`
    oldviirst=`cat $VF 2>/dev/null || echo empty`

    if [[ $modist != $oldmodist ]] ; then
        MDIRTY=true
        if [[ $DEBUG -eq 1 ]] ; then echo Old modis timestamp: $oldmodist new: $modist; fi
        echo $modist > $MF
        ftp-get $modis $modisfile modis-$ZONE.txt
        truncate -s 0 $DEST/modis.txt
    else
        if [[ $DEBUG -eq 1 ]] ; then echo "MODIS data not modified"; fi
    fi

    if [[ $viirst != $oldviirst ]] ; then
        VDIRTY=true
        if [[ $DEBUG -eq 1 ]] ; then echo Old viirs timestamp: $oldviirst new: $viirst; fi
        echo $viirst > $VF
        ftp-get $viirs $viirsfile viir-$ZONE.txt
        truncate -s 0 $DEST/viir.txt
    else
        if [[ $DEBUG -eq 1 ]] ; then echo "VIRRS data not modified"; fi
    fi
done

for ZONE in $ZONES
do
    if [[ $MDIRTY ]]
    then
        cat $DEST/modis-$ZONE.txt >> $DEST/modis.txt
    fi
    if [[ $VDIRTY ]]
    then
        cat $DEST/viir-$ZONE.txt >> $DEST/viir.txt
    fi
done

FILES=""

if [[ $MDIRTY ]]
then
    FILES=$DEST/modis.txt
fi

if [[ $VDIRTY ]]
then
    FILES="${FILES} ${DEST}/viir.txt"
fi

if [[ $DEBUG -eq 1 ]] ; then echo "Files to import $FILES"; fi

(cd $DIR/../fires-csv-mongo-import/ && /usr/local/bin/node fires-csv-mongo-import.js $FILES)

exit 0
