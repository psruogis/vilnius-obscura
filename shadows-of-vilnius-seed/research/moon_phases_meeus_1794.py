import math, datetime
def greg_easter(Y):
    a=Y%19;b=Y//100;c=Y%100;d=b//4;e=b%4;f=(b+8)//25;g=(b-f+1)//3;h=(19*a+b-d-g+15)%30
    i=c//4;k=c%4;l=(32+2*e+2*i-h-k)%7;m=(a+11*h+22*l)//451;month=(h+l-7*m+114)//31;day=((h+l-7*m+114)%31)+1
    return datetime.date(Y,month,day)
def jul_easter(Y):
    a=Y%4;b=Y%7;c=Y%19;d=(19*c+15)%30;e=(2*a+4*b-d+34)%7;month=(d+e+114)//31;day=((d+e+114)%31)+1
    return month,day
print("Greg Easter 1794:",greg_easter(1794), greg_easter(1794).strftime('%A'))
m,d=jul_easter(1794)
print("Julian Easter 1794 (Julian cal):",m,d, "-> Gregorian +11 days:", datetime.date(1794,m,d)+datetime.timedelta(days=11))
for s in ["1794-04-22","1794-04-23","1794-04-24","1794-04-25","1794-07-19","1794-07-20","1794-08-11","1794-08-12","1794-10-10","1794-10-30","1794-12-07"]:
    dd=datetime.date.fromisoformat(s); print(s, dd.strftime('%A'))

# Meeus ch.49 moon phases (mean + main corrections), result in JDE (TT)
def phase_jde(k):
    T=k/1236.85
    JDE=2451550.09766+29.530588861*k+0.00015437*T*T-0.000000150*T**3+0.00000000073*T**4
    E=1-0.002516*T-0.0000074*T*T
    M=math.radians((2.5534+29.10535670*k-0.0000014*T*T-0.00000011*T**3)%360)
    Mp=math.radians((201.5643+385.81693528*k+0.0107582*T*T+0.00001238*T**3-0.000000058*T**4)%360)
    F=math.radians((160.7108+390.67050284*k-0.0016118*T*T-0.00000227*T**3+0.000000011*T**4)%360)
    Om=math.radians((124.7746-1.56375588*k+0.0020672*T*T+0.00000215*T**3)%360)
    frac=round((k-math.floor(k))*4)/4
    if frac==0.0:
        c=(-0.40720*math.sin(Mp)+0.17241*E*math.sin(M)+0.01608*math.sin(2*Mp)+0.01039*math.sin(2*F)+0.00739*E*math.sin(Mp-M)-0.00514*E*math.sin(Mp+M)+0.00208*E*E*math.sin(2*M)-0.00111*math.sin(Mp-2*F)-0.00057*math.sin(Mp+2*F)+0.00056*E*math.sin(2*Mp+M)-0.00042*math.sin(3*Mp)+0.00042*E*math.sin(M+2*F)+0.00038*E*math.sin(M-2*F)-0.00024*E*math.sin(2*Mp-M)-0.00017*math.sin(Om))
    elif frac==0.5:
        c=(-0.40614*math.sin(Mp)+0.17302*E*math.sin(M)+0.01614*math.sin(2*Mp)+0.01043*math.sin(2*F)+0.00734*E*math.sin(Mp-M)-0.00515*E*math.sin(Mp+M)+0.00209*E*E*math.sin(2*M)-0.00111*math.sin(Mp-2*F)-0.00057*math.sin(Mp+2*F)+0.00056*E*math.sin(2*Mp+M)-0.00042*math.sin(3*Mp)+0.00042*E*math.sin(M+2*F)+0.00038*E*math.sin(M-2*F)-0.00024*E*math.sin(2*Mp-M)-0.00017*math.sin(Om))
    else:
        c=(-0.62801*math.sin(Mp)+0.17172*E*math.sin(M)-0.01183*E*math.sin(Mp+M)+0.00862*math.sin(2*Mp)+0.00804*math.sin(2*F)+0.00454*E*math.sin(Mp-M)+0.00204*E*E*math.sin(2*M)-0.00180*math.sin(Mp-2*F)-0.00070*math.sin(Mp+2*F)-0.00040*math.sin(3*Mp)-0.00034*E*math.sin(2*Mp-M)+0.00032*E*math.sin(M+2*F)+0.00032*E*math.sin(M-2*F))
        W=0.00306-0.00038*E*math.cos(M)+0.00026*math.cos(Mp)-0.00002*math.cos(Mp-M)+0.00002*math.cos(Mp+M)+0.00002*math.cos(2*F)
        c+= W if frac==0.25 else -W
    return JDE+c
def jd_to_dt(jd):
    return datetime.datetime(2000,1,1,12)+datetime.timedelta(days=jd-2451545.0)
# Delta T ~ +16 s in 1794 negligible; Vilnius local mean solar time = UT + 25.28E/15 h = +1h41m
k0=math.floor((1794.0-2000)*12.3685)
names={0:'New',0.25:'FirstQ',0.5:'Full',0.75:'LastQ'}
for k in [k0+i*0.25 for i in range(0,56)]:
    jd=phase_jde(k); dt=jd_to_dt(jd)
    if dt.year==1794 and dt.month in (4,7,8,9,10,11,12):
        loc=dt+datetime.timedelta(hours=25.28/15)
        print(names[round((k-math.floor(k))*4)/4], dt.strftime('%Y-%m-%d %H:%M UT'), '| Vilnius LMT', loc.strftime('%m-%d %H:%M'))
