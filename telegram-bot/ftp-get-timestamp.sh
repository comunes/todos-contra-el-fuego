#!/bin/bash
USER=$1
PASS=$2

function ftp-timestamp {
ncftp -u $USER -p $PASS \
      ftp://$1 <<EOF | tail -20 | egrep '\.txt' | tail -1 | awk '{print $4"/"$7"/"$8}'
ls -lrt
EOF
if [[ $? != 0 ]]; then
    echo "Error getting viirs ftp timestamp"
fi

}

modis="nrt4.modaps.eosdis.nasa.gov/FIRMS/c6/Global/"
viirs="nrt3.modaps.eosdis.nasa.gov/FIRMS/viirs/Global/"

modisftp=`ftp-timestamp $modis`
#echo $modist
modist=`echo $modisftp | perl -p -e 's/(\d+)\/(\d{2}\:\d{2})\/(.*)(\d{4})(\d{3})(\.)(txt)/modis|$1|$2|$4|$5/g'`

viirsftp=`ftp-timestamp $viirs`
#echo $viirst
viirst=`echo $viirsftp | perl -p -e 's/(\d+)\/(\d{2}\:\d{2})\/(.*)(\d{4})(\d{3})(\.)(txt)/viirs|$1|$2|$4|$5/g'`

MF=modis-timestamp.txt
VF=viirs-timestamp.txt
oldmodist=`cat $MF 2>/dev/null || echo emtpy`
oldviirst=`cat $VF 2>/dev/null || echo empty`

if [[ $modist != $oldmodist ]] ; then
    echo Old modis timestamp: $oldmodist new: $modist
fi

if [[ $viirst != $oldviirst ]] ; then
    echo Old viirs timestamp: $oldviirst new: $viirst
fi


#496956/20:32/MODIS_C6_Global_MCD14DL_NRT_2017310.txt
#modis|496956|20:32|2017|310
#2808549/20:30/VIIRS_I_Global_VNP14IMGTDL_NRT_2017310.txt
#viirs|2808549|20:30|2017|310
