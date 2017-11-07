#!/bin/bash
USER=$1
PASS=$2
DEST=$3

DEBUG=0

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
        echo "Error getting ftp data" >> $DEST/nada-download.errors.log
    else
        mv $DEST/$3.tmp $DEST/$3
    fi
}

modis="nrt4.modaps.eosdis.nasa.gov/FIRMS/c6/Global/"
viirs="nrt3.modaps.eosdis.nasa.gov/FIRMS/viirs/Global/"

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

MF=$DEST/modis-timestamp.txt
VF=$DEST/viirs-timestamp.txt
oldmodist=`cat $MF 2>/dev/null || echo emtpy`
oldviirst=`cat $VF 2>/dev/null || echo empty`

if [[ $modist != $oldmodist ]] ; then
    if [[ $DEBUG -eq 1 ]] ; then echo Old modis timestamp: $oldmodist new: $modist; fi
    echo $modist > $MF
    ftp-get $modis $modisfile modis.txt
    echo -n "ping" | nc 127.0.0.1 40001 -q 0
else
    if [[ $DEBUG -eq 1 ]] ; then echo "MODIS data not modified"; fi
fi

if [[ $viirst != $oldviirst ]] ; then
    if [[ $DEBUG -eq 1 ]] ; then echo Old viirs timestamp: $oldviirst new: $viirst; fi
    echo $viirst > $VF
    ftp-get $viirs $viirsfile viir.txt
    echo -n "ping" | nc 127.0.0.1 40002 -q 0
else
    if [[ $DEBUG -eq 1 ]] ; then echo "VIRRS data not modified"; fi
fi

exit 0

#496956/20:32/MODIS_C6_Global_MCD14DL_NRT_2017310.txt
#modis|496956|20:32|2017|310
#2808549/20:30/VIIRS_I_Global_VNP14IMGTDL_NRT_2017310.txt
#viirs|2808549|20:30|2017|310
