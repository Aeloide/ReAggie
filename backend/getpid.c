#define _GNU_SOURCE
#include <poll.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/fcntl.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

int main(int ac, char **av, char **ev) {
	int uid = geteuid();
	int gid = getegid();
	printf("uid: %d\ngid: %d\n", uid, gid);
}